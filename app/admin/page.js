"use client";

import { useState } from "react";
import { apiPost } from "@/lib/api";

export default function BuscarPage() {
  const [plate, setPlate] = useState("");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");

  async function start() {
    setMsg("");
    try {
      const r = await apiPost("/api/createThread", { plate, text });
      window.location.href = `/t/${r.threadId}`;
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <div style={{ maxWidth: 520, fontFamily: "Arial, sans-serif" }}>
      <h2>Buscar placa e enviar mensagem</h2>

      <label>Placa</label>
      <input
        style={inp}
        value={plate}
        onChange={(e) => setPlate(e.target.value)}
        placeholder="ABC1D23"
      />

      <label>Mensagem</label>
      <textarea
        style={ta}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Escreva sua mensagem..."
      />

      <div style={{ marginTop: 12 }}>
        <button onClick={start}>Enviar e abrir chat</button>
      </div>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </div>
  );
}

const inp = {
  width: "100%",
  padding: 10,
  border: "1px solid #ccc",
  borderRadius: 6,
  marginTop: 6,
  marginBottom: 10,
};

const ta = {
  width: "100%",
  minHeight: 120,
  padding: 10,
  border: "1px solid #ccc",
  borderRadius: 6,
  marginTop: 6,
};
