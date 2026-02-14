"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebaseClient";

export default function BuscarPage() {
  const router = useRouter();

  const [userEmail, setUserEmail] = useState("");
  const [verified, setVerified] = useState(false);

  const [myPlate, setMyPlate] = useState("");
  const [myWhatsappFull, setMyWhatsappFull] = useState(""); // armazenado como números (ex: 5511999999999)

  const [editing, setEditing] = useState(false);
  const [newPlate, setNewPlate] = useState("");
  const [newWhatsappLocal, setNewWhatsappLocal] = useState(""); // sem +55 (só números)

  const [toPlate, setToPlate] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // Upload placa destino (foto)
  const fileInputRef = useRef(null);
  const [destFile, setDestFile] = useState(null);
  const [destPreviewUrl, setDestPreviewUrl] = useState("");
  const [scanning, setScanning] = useState(false);

  function normPlate(s) {
    return (s || "")
      .toString()
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  function onlyDigits(s) {
    return (s || "").toString().replace(/\D/g, "");
  }

  function splitWhatsapp(full) {
    const d = onlyDigits(full);
    // se começar com 55, tira
    if (d.startsWith("55")) return d.slice(2);
    return d;
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
    setMyWhatsappFull(j.whatsapp || "");

    setNewPlate(j.plate || "");
    setNewWhatsappLocal(splitWhatsapp(j.whatsapp || ""));
  }

  async function saveMine() {
    const plate = normPlate(newPlate);
    if (!plate) return alert("Placa obrigatória.");

    const local = onlyDigits(newWhatsappLocal);
    // monta whatsapp completo com BR +55 (se tiver algo digitado)
    const whatsapp = local ? `55${local}` : "";

    const r = await apiFetch("/api/vehicles/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plate, whatsapp }),
    });

    const j = await r.json();
    if (!r.ok) return alert(j.error || "Erro ao salvar.");

    setMyPlate(j.plate || plate);
    setMyWhatsappFull(j.whatsapp || whatsapp);
    setEditing(false);
  }

  async function validateDestPlate(p) {
    const plate = normPlate(p);
    if (!plate) return { ok: false, reason: "Placa vazia" };

    const r = await apiFetch(`/api/vehicles/claim?plate=${encodeURIComponent(plate)}`);
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

  // ===== Upload + OCR (destino) =====
  function pickDestImage() {
    if (fileInputRef.current) fileInputRef.current.click();
  }

  function onDestFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;

    setDestFile(f);

    const url = URL.createObjectURL(f);
    setDestPreviewUrl(url);

    // opcional: já tenta escanear automaticamente
    scanDestPlateFromImage(f);
  }

  async function scanDestPlateFromImage(file) {
    try {
      setScanning(true);

      // Endpoint que você vai criar depois.
      // Deve retornar JSON: { plate: "ABC1D23" }
      const fd = new FormData();
      fd.append("image", file);

      const r = await apiFetch("/api/plate/scan", {
        method: "POST",
        body: fd,
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        return alert(j.error || "OCR não configurado (crie /api/plate/scan).");
      }

      const plate = normPlate(j.plate || "");
      if (!plate) return alert("Não consegui ler a placa na foto. Tente outra imagem.");

      setToPlate(plate);
    } catch (e) {
      alert(e?.message || "Erro ao ler placa pela foto.");
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUserEmail("");
        setVerified(false);
        setMyPlate("");
        setMyWhatsappFull("");
        setNewPlate("");
        setNewWhatsappLocal("");
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

  // limpa preview URL quando trocar
  useEffect(() => {
    return () => {
      if (destPreviewUrl) URL.revokeObjectURL(destPreviewUrl);
    };
  }, [destPreviewUrl]);

  const isLogged = !!auth.currentUser;

  // ===== estilos =====
  const box = {
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 16,
  };

  const label = { fontWeight: 700, marginBottom: 6 };

  const input = {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    outline: "none",
  };

  const textarea = { ...input, resize: "vertical" };

  const btn = (primary = false) => ({
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)",
    background: primary ? "rgba(255,255,255,0.12)" : "transparent",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
  });

  const smallBadge = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 82,
    padding: "10px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.06)",
    fontWeight: 800,
  };

  return (
    <div style={{ padding: 24, maxWidth: 1000 }}>
      <h2 style={{ margin: 0 }}>Buscar placa e enviar mensagem</h2>

      <div style={{ marginTop: 8, opacity: 0.85 }}>
        <div>
          <b>Usuário:</b> {userEmail || "-"}
        </div>
        <div>
          <b>Email verificado:</b> {String(verified)}
        </div>
      </div>

      {/* Meu carro */}
      <div style={{ marginTop: 18, ...box }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ color: "#6f6" }}>✅</span>
            <b>Seu carro cadastrado</b>
          </div>

          {!editing && (
            <button style={btn(false)} onClick={() => setEditing(true)} disabled={!isLogged}>
              Editar
            </button>
          )}
        </div>

        {/* Placa */}
        <div style={{ marginTop: 14 }}>
          <div style={label}>Minha placa</div>
          <input
            value={editing ? newPlate : (myPlate || "")}
            onChange={(e) => setNewPlate(e.target.value)}
            disabled={!editing}
            placeholder="Ex: ABC1234 ou ABC1D23"
            style={{ ...input, opacity: editing ? 1 : 0.95 }}
          />
        </div>

        {/* WhatsApp BR +55 */}
        <div style={{ marginTop: 14 }}>
          <div style={label}>Meu WhatsApp (com DDI, só números)</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={smallBadge}>BR +55</div>
            <input
              value={editing ? newWhatsappLocal : splitWhatsapp(myWhatsappFull)}
              onChange={(e) => setNewWhatsappLocal(e.target.value)}
              disabled={!editing}
              placeholder="Ex: 11999999999"
              style={{ ...input }}
            />
          </div>
        </div>

        {editing && (
          <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
            <button style={btn(true)} onClick={saveMine} disabled={!isLogged}>
              Salvar
            </button>
            <button style={btn(false)} onClick={() => setEditing(false)}>
              Cancelar
            </button>
          </div>
        )}
      </div>

      {/* Enviar mensagem */}
      <div style={{ marginTop: 18, ...box }}>
        <h3 style={{ marginTop: 0 }}>Enviar mensagem para outra placa</h3>

        {/* Placa destino + Upload */}
        <div style={{ marginTop: 10 }}>
          <div style={label}>Placa destino</div>

          <div style={{ display: "flex", gap: 12, alignItems: "stretch", flexWrap: "wrap" }}>
            {/* Digitar placa */}
            <div style={{ flex: "1 1 320px" }}>
              <input
                value={toPlate}
                onChange={(e) => setToPlate(e.target.value)}
                placeholder="Ex: ABC1234 ou ABC1D23"
                style={input}
              />
              <div style={{ marginTop: 8, opacity: 0.75, fontSize: 12 }}>
                (antiga: ABC1234 • Mercosul: ABC1D23)
              </div>
            </div>

            {/* Upload foto */}
            <div style={{ flex: "0 0 320px" }}>
              <div
                style={{
                  ...box,
                  padding: 12,
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  justifyContent: "space-between",
                }}
              >
                <div style={{ fontWeight: 800 }}>Foto da Placa</div>

                {destPreviewUrl ? (
                  <img
                    src={destPreviewUrl}
                    alt="Prévia"
                    style={{
                      width: "100%",
                      maxHeight: 120,
                      objectFit: "cover",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.12)",
                    }}
                  />
                ) : (
                  <div style={{ opacity: 0.7, fontSize: 13 }}>
                    Envie uma foto.
                  </div>
                )}

                <div style={{ display: "flex", gap: 10 }}>
                  <button style={btn(false)} onClick={pickDestImage} disabled={!isLogged || scanning}>
                    {scanning ? "Lendo..." : "Escolher foto"}
                  </button>

                  {destFile && (
                    <button
                      style={btn(true)}
                      onClick={() => scanDestPlateFromImage(destFile)}
                      disabled={!isLogged || scanning}
                      title="Tentar ler de novo"
                    >
                      Reprocessar
                    </button>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={onDestFileChange}
                  style={{ display: "none" }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Mensagem */}
        <div style={{ marginTop: 16 }}>
          <div style={label}>Mensagem</div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Digite sua mensagem..."
            style={textarea}
          />
        </div>

        <button
          onClick={sendAndOpenChat}
          disabled={sending || !isLogged}
          style={{ ...btn(true), marginTop: 14 }}
        >
          {sending ? "Enviando..." : "Enviar e abrir chat"}
        </button>
      </div>
    </div>
  );
}
