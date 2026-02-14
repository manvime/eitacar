"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebaseClient";

const onlyDigits = (s = "") => String(s).replace(/\D+/g, "");

function normalizePlate(raw = "") {
  return String(raw).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

// visual: antiga ABC-1234 | mercosul ABC1D23
function formatPlateDisplay(raw = "") {
  const v = normalizePlate(raw);
  if (v.length === 7 && /^[A-Z]{3}[0-9]{4}$/.test(v)) return `${v.slice(0, 3)}-${v.slice(3)}`;
  return v;
}

// guarda sempre como "55" + ddd+numero (só dígitos)
function normalizeWhatsappBR(input = "") {
  const d = onlyDigits(input);
  const without55 = d.startsWith("55") ? d.slice(2) : d;
  // evita número gigante
  return ("55" + without55).slice(0, 13); // 55 + 11 dígitos (DDD+9 dígitos) (aprox)
}

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
    const plate = normalizePlate(newPlate);
    if (!plate) return alert("Placa obrigatória.");

    const whatsapp = newWhatsapp ? normalizeWhatsappBR(newWhatsapp) : "";

    const r = await apiFetch("/api/vehicles/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plate, whatsapp }),
    });

    const j = await r.json();
    if (!r.ok) return alert(j.error || "Erro ao salvar.");

    setMyPlate(j.plate || plate);
    setMyWhatsapp(j.whatsapp || whatsapp);
    setEditing(false);
  }

  async function validateDestPlate(p) {
    const plate = normalizePlate(p);
    if (!plate) return { ok: false, reason: "Placa vazia" };

    const r = await apiFetch(`/api/vehicles/claim?plate=${encodeURIComponent(plate)}`);
    const j = await r.json();

    if (!j.exists) return { ok: false, reason: "Essa placa não está cadastrada." };
    return { ok: true };
  }

  async function sendAndOpenChat() {
    try {
      setSending(true);

      const fromPlate = normalizePlate(myPlate);
      const dest = normalizePlate(toPlate);
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

  const card = {
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 12,
    padding: 16,
    marginTop: 14,
  };

  const label = { display: "block", marginTop: 12, opacity: 0.9 };

  const inputBox = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    outline: "none",
    fontSize: 16,
  };

  const btn = {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.10)",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
  };

  const btnOutline = {
    ...btn,
    background: "transparent",
  };

  const whatsappLocalDigits = useMemo(() => {
    const d = onlyDigits(newWhatsapp);
    return d.startsWith("55") ? d.slice(2) : d;
  }, [newWhatsapp]);

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h2>Buscar placa e enviar mensagem</h2>

      {!isLogged && (
        <div style={{ marginTop: 12, opacity: 0.9 }}>
          Você precisa estar logado. Vá em <b>/login</b>.
        </div>
      )}

      {isLogged && (
        <>
          <div style={{ marginTop: 8, opacity: 0.8 }}>
            Usuário: {userEmail} <br />
            Email verificado: {String(verified)}
          </div>

          {/* CARD: meu cadastro */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 800 }}>
                ✅ Seu carro cadastrado
              </div>
              <div style={{ flex: 1 }} />
              {!editing ? (
                <button
                  style={btnOutline}
                  onClick={() => {
                    setEditing(true);
                    setNewPlate(myPlate || "");
                    setNewWhatsapp(myWhatsapp || "");
                  }}
                >
                  Editar
                </button>
              ) : (
                <button style={btnOutline} onClick={() => setEditing(false)}>
                  Cancelar
                </button>
              )}
            </div>

            {/* Minha placa */}
            <label style={label}>Minha placa</label>
            {!editing ? (
              <input
                style={inputBox}
                readOnly
                value={formatPlateDisplay(myPlate)}
                placeholder="(antiga AAA1234 ou Mercosul AAA1A23)"
              />
            ) : (
              <input
                style={inputBox}
                value={formatPlateDisplay(newPlate)}
                onChange={(e) => setNewPlate(normalizePlate(e.target.value))}
                placeholder="(antiga AAA1234 ou Mercosul AAA1A23)"
              />
            )}

            {/* WhatsApp */}
            <label style={label}>Meu WhatsApp (com DDI, só números)</label>
            {!editing ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.06)",
                    color: "white",
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                  }}
                >
                  🇧🇷 +55
                </div>
                <input
                  style={{ ...inputBox, flex: 1 }}
                  readOnly
                  value={onlyDigits(myWhatsapp).replace(/^55/, "")}
                  placeholder="DDD + número"
                />
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.06)",
                    color: "white",
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                  }}
                >
                  🇧🇷 +55
                </div>
                <input
                  style={{ ...inputBox, flex: 1 }}
                  inputMode="numeric"
                  value={whatsappLocalDigits}
                  onChange={(e) => setNewWhatsapp("55" + onlyDigits(e.target.value))}
                  placeholder="DDD + número (ex: 11999998888)"
                />
              </div>
            )}

            {editing && (
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button style={btn} onClick={saveMine}>
                  Salvar
                </button>
                <button style={btnOutline} onClick={() => setEditing(false)}>
                  Cancelar
                </button>
              </div>
            )}
          </div>

          {/* CARD: enviar mensagem */}
          <div style={card}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>
              Enviar mensagem para outra placa
            </div>

            <label style={label}>Placa destino</label>
            <input
              style={inputBox}
              value={formatPlateDisplay(toPlate)}
              onChange={(e) => setToPlate(normalizePlate(e.target.value))}
              placeholder="Ex: ABC1234 ou ABC1D23"
            />

            <label style={label}>Mensagem</label>
            <textarea
              style={{ ...inputBox, minHeight: 110, resize: "vertical" }}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Digite sua mensagem..."
            />

            <div style={{ marginTop: 12 }}>
              <button style={btn} onClick={sendAndOpenChat} disabled={sending}>
                {sending ? "Enviando..." : "Enviar e abrir chat"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
