"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { auth, db } from "@/lib/firebaseClient";
import { getAuthToken } from "@/lib/getAuthToken";

export default function ThreadPage() {
  const router = useRouter();
  const params = useParams();
  const threadId = params?.threadId ? String(params.threadId) : "";

  const [user, setUser] = useState(null);
  const [myPlate, setMyPlate] = useState("");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const listRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      setUser(u || null);
      if (!u) router.push("/login");
    });
    return () => unsub();
  }, [router]);

  // pega minha placa
  useEffect(() => {
    async function loadPlate() {
      if (!user) return;
      const snap = await getDoc(doc(db, "users", user.uid));
      const p = snap.exists() ? String(snap.data()?.myPlate || "") : "";
      setMyPlate(p);
    }
    loadPlate();
  }, [user]);

  // ouvir mensagens
  useEffect(() => {
    if (!threadId) return;

    setLoading(true);
    const q = query(
      collection(db, "threads", threadId, "messages"),
      orderBy("createdAt", "asc"),
      limit(200)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        setMessages(arr);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [threadId]);

  // scroll pro final quando chega msg
  useEffect(() => {
    if (!bottomRef.current) return;
    bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const myPlateUpper = useMemo(() => (myPlate || "").toUpperCase(), [myPlate]);

  async function send() {
    if (!threadId) return alert("threadId obrigatório");
    if (!text.trim()) return;
    if (sending) return;

    try {
      setSending(true);
      const token = await getAuthToken();

      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ threadId, text: text.trim() }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) return alert(data?.error || "Erro ao enviar.");

      setText("");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e) {
    // Enter envia, Shift+Enter quebra linha
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <h2 style={{ marginTop: 10 }}>Chat</h2>
      <div style={{ opacity: 0.8, marginBottom: 10 }}>
        <b>Thread:</b> {threadId}
      </div>

      <div
        ref={listRef}
        style={{
          border: "1px solid #333",
          borderRadius: 10,
          padding: 12,
          height: 420,
          overflowY: "auto",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        {loading ? (
          <div style={{ opacity: 0.7 }}>Carregando…</div>
        ) : messages.length === 0 ? (
          <div style={{ opacity: 0.7 }}>Sem mensagens ainda.</div>
        ) : (
          messages.map((m) => {
            const from = String(m.fromPlate || "").toUpperCase();
            const mine = from && myPlateUpper && from === myPlateUpper;

            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  justifyContent: mine ? "flex-end" : "flex-start",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    maxWidth: "75%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #333",
                    background: mine ? "rgba(40,140,255,0.18)" : "rgba(255,255,255,0.05)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                    {mine ? "Eu" : from || "Outro"}
                  </div>
                  <div style={{ fontSize: 14 }}>{String(m.text || "")}</div>
                </div>
              </div>
            );
          })
        )}

        <div ref={bottomRef} />
      </div>

      <div style={{ marginTop: 12 }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Digite sua mensagem... (Enter envia | Shift+Enter quebra linha)"
          style={{
            width: "100%",
            minHeight: 90,
            padding: 10,
            borderRadius: 10,
            border: "1px solid #333",
            background: "transparent",
            color: "white",
          }}
        />

        <button
          onClick={send}
          disabled={sending || !text.trim()}
          style={{
            marginTop: 10,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #333",
            background: sending ? "#222" : "transparent",
            color: "white",
            cursor: "pointer",
          }}
        >
          {sending ? "Enviando..." : "Enviar"}
        </button>
      </div>
    </div>
  );
}
