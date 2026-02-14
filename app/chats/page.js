"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebaseClient";
import { doc, getDoc, collection, query, where, orderBy, onSnapshot } from "firebase/firestore";

export default function ChatsPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [myPlate, setMyPlate] = useState("");
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);

  // login
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUser(u || null);
      if (!u) router.push("/login");
    });
    return () => unsub();
  }, [router]);

  // pega minha placa
  useEffect(() => {
    async function load() {
      if (!user) return;
      setLoading(true);

      const snap = await getDoc(doc(db, "users", user.uid));
      const plate = snap.exists() ? (snap.data()?.myPlate || "") : "";
      setMyPlate(plate);

      setLoading(false);
    }
    load();
  }, [user]);

  // lista threads onde minha placa participa
  useEffect(() => {
    if (!myPlate) return;

    const q = query(
      collection(db, "threads"),
      where("participantsPlates", "array-contains", myPlate),
      orderBy("updatedAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      setThreads(arr);
    });

    return () => unsub();
  }, [myPlate]);

  const items = useMemo(() => {
    return threads.map((t) => {
      const parts = t.participantsPlates || [];
      const other = parts.find((p) => p !== myPlate) || "(desconhecido)";
      return { ...t, other };
    });
  }, [threads, myPlate]);

  if (loading) return <div style={{ padding: 20 }}>Carregando…</div>;

  if (!myPlate) {
    return (
      <div style={{ padding: 20, maxWidth: 900 }}>
        <h2>Minhas conversas</h2>
        <p>Você ainda não cadastrou sua placa.</p>
        <button style={{ padding: 10 }} onClick={() => router.push("/buscar")}>
          Ir para /buscar
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, maxWidth: 900 }}>
      <h2>Minhas conversas</h2>

      <div style={{ opacity: 0.85, marginBottom: 12 }}>
        <b>Minha placa:</b> {myPlate}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <button style={{ padding: 10 }} onClick={() => router.push("/buscar")}>
          Voltar
        </button>
      </div>

      {items.length === 0 ? (
        <div style={{ opacity: 0.8 }}>Você ainda não tem conversas.</div>
      ) : (
        <div style={{ border: "1px solid #333", borderRadius: 8 }}>
          {items.map((t) => (
            <div
              key={t.id}
              style={{
                padding: 14,
                borderBottom: "1px solid #222",
                cursor: "pointer",
              }}
              onClick={() => router.push(`/t/${t.id}`)}
            >
              <div style={{ fontSize: 14, opacity: 0.9 }}>
                Conversa com: <b>{t.other}</b>
              </div>
              <div style={{ fontSize: 12, opacity: 0.6 }}>
                Thread: {t.id}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
