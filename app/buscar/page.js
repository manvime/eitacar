"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebaseClient";

export default function BuscarPage() {
  const router = useRouter();

  const [userEmail, setUserEmail] = useState("");
  const [verified, setVerified] = useState(false);

  const [myPlate, setMyPlate] = useState("");
  const [myWhatsapp, setMyWhatsapp] = useState("");

  const [editing, setEditing] = useState(false);
  const [newPlate, setNewPlate] = useState("");
  const [newWhatsapp, setNewWhatsapp] = useState("");

  const [toPlate, setToPlate] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  function normPlate(s) {
    return (s || "")
      .toString()
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  // ✅ pega token NA HORA e envia Authorization certo
  async function apiFetch(url, options = {}) {
    const u = auth.currentUser;
    if (!u) throw new Error("Sem token (não logado)");

    const token = await u.getIdToken(true);

    return fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
  }

  async function loadMine() {
    const r = await apiFetch("/api/vehicles/claim?mine=1");
    const j = await r.json();
    setMyPlate(j.plate || "");
    setMyWhatsapp(j.whatsapp || "");
    setNewPlate(j.plate || "");
    setNewWhatsapp(j.whatsapp || "");
  }

  async function saveMine() {
    const plate = normPlate(newPlate);
    if (!plate) return alert("Placa obrigatória.");

    const r = await apiFetch("/api/vehicles/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plate, whatsapp: newWhatsapp }),
    });

    const j = await r.json();
    if (!r.ok) return alert(j.error || "Erro ao salvar.");

    setMyPlate(j.plate);
    setMyWhatsapp(j.whatsapp || "");
    setEditing(false);
  }

  async function validateDestPlate(p) {
    const plate = normPlate(p);
    if (!plate) return { ok: false, reason: "Placa vazia" };

    const r = await apiFetch(
      `/api/vehicles/claim?plate=${encodeURIComponent(plate)}`
    );
    const j = await r.json();

    if (!j.exists) return { ok: false, reason: "Essa placa não está cadastrada." };
    return { ok: true };
  }

  async function sendAndOpenChat() {
    try {
      setSending(true);

      const fromPlate = normPlate(myPlate);
      const dest = normPlate(toPlate);
      const msg = (text || "").trim();

      if (!fromPlate) return alert("Você ainda não cadastrou sua placa.");
      if (!dest) return alert("Placa destino obrigatória.");
      if (!msg) return alert("Mensagem obrigatória.");

      const v = await validateDestPlate(dest);
      if (!v.ok) return alert(v.reason);

      const r = await apiFetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromPlate, toPlate: dest, text: msg }),
      });

      const j = await r.json();
      if (!r.ok) return alert(j.error || "Falha ao enviar.");

      router.push(`/t/${j.threadId}`);
    } catch (e) {
      alert(e?.message || "Erro");
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUserEmail("");
        setVerified(false);
        setMyPlate("");
        setMyWhatsapp("");
        setNewPlate("");
        setNewWhatsapp("");
        return;
      }

      setUserEmail(u.email || "");
      setVerified(!!u.emailVerified);

      try {
        await loadMine();
      } catch (e) {
        console.error(e);
      }
    });

    return () => unsub();
  }, []);

  const isLogged = !!auth.currentUser;

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h2>Buscar placa e enviar mensagem</h2>

      <div style={{ marginTop: 8, opacity: 0.8 }}>
        <div><b>Usuário:</b> {userEmail || "-"}</div>
        <div><b>Email verificado:</b> {String(verified)}</div>
      </div>

      <div style={{ marginTop: 18, border: "1px solid #333", padding: 16, borderRadius: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "#6f6" }}>✅</span>
          <b>Seu carro cadastrado</b>
        </div>

        {!editing ? (
          <>
            <div style={{ marginTop: 8 }}><b>Placa:</b> {myPlate || "(não cadastrada)"}</div>
            <div style={{ marginTop: 8 }}><b>WhatsApp:</b> {myWhatsapp || "(não cadastrado)"}</div>
            <button style={{ marginTop: 12 }} onClick={() => setEditing(true)} disabled={!isLogged}>
              Editar minha placa
            </button>
          </>
        ) : (
          <>
            <div style={{ marginTop: 10 }}>
              <div>Minha placa</div>
              <input value={newPlate} onChange={(e) => setNewPlate(e.target.value)} style={{ width: 260 }} />
            </div>

            <div style={{ marginTop: 10 }}>
              <div>Meu WhatsApp (com DDI, só números)</div>
              <input value={newWhatsapp} onChange={(e) => setNewWhatsapp(e.target.value)} style={{ width: 260 }} />
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button onClick={saveMine}>Salvar</button>
              <button onClick={() => setEditing(false)}>Cancelar</button>
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: 18, border: "1px solid #333", padding: 16, borderRadius: 10 }}>
        <h3>Enviar mensagem para outra placa</h3>

        <div style={{ marginTop: 10 }}>
          <div><b>Placa destino</b></div>
          <input value={toPlate} onChange={(e) => setToPlate(e.target.value)} style={{ width: 260 }} />
        </div>

        <div style={{ marginTop: 10 }}>
          <div><b>Mensagem</b></div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} style={{ width: "100%" }} />
        </div>

        <button onClick={sendAndOpenChat} disabled={sending || !isLogged} style={{ marginTop: 12 }}>
          {sending ? "Enviando..." : "Enviar e abrir chat"}
        </button>
      </div>
    </div>
  );
}
