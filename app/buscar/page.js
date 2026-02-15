"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import "@/lib/firebaseClient"; // garante init do Firebase no client

export default function BuscarPage() {
  const router = useRouter();

  // ✅ auth seguro
  const [user, setUser] = useState(null);
  const userRef = useRef(null);

  const userEmail = user?.email || "";
  const verified = !!user?.emailVerified;
  const isLogged = !!user;

  // meu carro
  const [myPlate, setMyPlate] = useState("");
  const [myWhatsappFull, setMyWhatsappFull] = useState(""); // ex: 5511999999999
  const [editing, setEditing] = useState(false);
  const [newPlate, setNewPlate] = useState("");
  const [newWhatsappLocal, setNewWhatsappLocal] = useState(""); // sem 55

  // enviar msg
  const [toPlate, setToPlate] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // foto (recorte/zoom)
  const fileInputRef = useRef(null);
  const [destFile, setDestFile] = useState(null);
  const [destPreviewUrl, setDestPreviewUrl] = useState("");
  const [scanning, setScanning] = useState(false);

  // crop state
  const imgRef = useRef(null);
  const viewRef = useRef(null);
  const [imgNatural, setImgNatural] = useState({ w: 1, h: 1 });
  const [view, setView] = useState({
    tx: 0, // translate x
    ty: 0, // translate y
    scale: 1,
  });

  // gesture
  const pointers = useRef(new Map());
  const gesture = useRef({
    startView: null,
    startDist: 0,
    startMid: { x: 0, y: 0 },
  });

  // ===== styles =====
  const box = useMemo(
    () => ({
      border: "1px solid rgba(255,255,255,0.15)",
      borderRadius: 14,
      padding: 16,
      background: "rgba(255,255,255,0.03)",
    }),
    []
  );

  const label = useMemo(() => ({ marginBottom: 8, opacity: 0.85 }), []);

  const input = useMemo(
    () => ({
      width: "100%",
      padding: "12px 12px",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.05)",
      color: "white",
      outline: "none",
    }),
    []
  );

  const btn = (primary) => ({
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.15)",
    background: primary ? "rgba(255,255,255,0.12)" : "transparent",
    color: "white",
    fontWeight: 800,
    cursor: "pointer",
    opacity: primary ? 1 : 0.95,
  });

  // ===== helpers =====
  function normPlate(s) {
    return (s || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 7);
  }

  function splitWhatsapp(full) {
    const only = (full || "").replace(/\D/g, "");
    if (!only) return "";
    // remove 55 se tiver
    if (only.startsWith("55")) return only.slice(2);
    return only;
  }

  function normWhatsappLocal(local) {
    const only = (local || "").replace(/\D/g, "");
    if (!only) return "";
    return `55${only}`; // salva com 55
  }

  // ✅ pega token NA HORA e manda Authorization certo (sem usar auth global)
  async function apiFetch(url, options = {}) {
    const u = userRef.current;
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
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Falha ao carregar dados");

    setMyPlate(j.plate || "");
    setMyWhatsappFull(j.whatsapp || "");
    setNewPlate(j.plate || "");
    setNewWhatsappLocal(splitWhatsapp(j.whatsapp || ""));
  }

  async function saveMine() {
    const plate = normPlate(newPlate);
    const whatsapp = normWhatsappLocal(newWhatsappLocal);

    if (!plate) return alert("Placa inválida.");
    if (!whatsapp || whatsapp.length < 12) return alert("WhatsApp inválido (DDD + número).");

    const r = await apiFetch("/api/vehicles/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plate, whatsapp }),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) return alert(j.error || "Falha ao salvar");

    setMyPlate(j.plate || plate);
    setMyWhatsappFull(j.whatsapp || whatsapp);
    setEditing(false);
  }

  async function validateDestPlate(p) {
    const plate = normPlate(p);
    if (!plate) return { ok: false, reason: "Placa vazia" };

    const r = await apiFetch(`/api/vehicles/claim?plate=${encodeURIComponent(plate)}`);
    const j = await r.json().catch(() => ({}));

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

      const j = await r.json().catch(() => ({}));
      if (!r.ok) return alert(j.error || "Falha ao enviar.");

      router.push(`/t/${j.threadId}`);
    } catch (e) {
      alert(e?.message || "Erro");
    } finally {
      setSending(false);
    }
  }

  // ===== auth listener =====
  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u || null);
      userRef.current = u || null;

      if (!u) {
        setMyPlate("");
        setMyWhatsappFull("");
        setNewPlate("");
        setNewWhatsappLocal("");
        return;
      }

      try {
        await loadMine();
      } catch (e) {
        console.error(e);
      }
    });

    return () => unsub();
  }, []);

  // cleanup preview url
  useEffect(() => {
    return () => {
      if (destPreviewUrl) URL.revokeObjectURL(destPreviewUrl);
    };
  }, [destPreviewUrl]);

  // ====== foto / crop ======
  function pickDestImage() {
    fileInputRef.current?.click();
  }

  async function onDestFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setDestFile(f);

    if (destPreviewUrl) URL.revokeObjectURL(destPreviewUrl);
    const url = URL.createObjectURL(f);
    setDestPreviewUrl(url);

    // reseta view
    setView({ tx: 0, ty: 0, scale: 1 });
    pointers.current.clear();
    gesture.current = { startView: null, startDist: 0, startMid: { x: 0, y: 0 } };
  }

  function getBoxPoint(e) {
    const rect = viewRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function mid(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function onPointerDown(e) {
    if (!destPreviewUrl) return;
    viewRef.current.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, getBoxPoint(e));

    const pts = Array.from(pointers.current.values());
    if (pts.length === 1) {
      gesture.current.startView = { ...view };
    } else if (pts.length === 2) {
      gesture.current.startView = { ...view };
      gesture.current.startDist = dist(pts[0], pts[1]);
      gesture.current.startMid = mid(pts[0], pts[1]);
    }
  }

  function onPointerMove(e) {
    if (!destPreviewUrl) return;
    if (!pointers.current.has(e.pointerId)) return;

    pointers.current.set(e.pointerId, getBoxPoint(e));
    const pts = Array.from(pointers.current.values());

    if (!gesture.current.startView) gesture.current.startView = { ...view };

    if (pts.length === 1) {
      const p = pts[0];
      const sp = getBoxPoint(e);
      // pan baseado em delta do ponteiro atual vs inicial não guardamos; simples: usa movementX/Y
      setView((v) => ({ ...v, tx: v.tx + e.movementX, ty: v.ty + e.movementY }));
    } else if (pts.length === 2) {
      const d = dist(pts[0], pts[1]);
      const m = mid(pts[0], pts[1]);

      const start = gesture.current.startView;
      const scale = clamp((start.scale * d) / (gesture.current.startDist || d), 0.5, 6);

      // zoom mantendo centro
      const dx = m.x - gesture.current.startMid.x;
      const dy = m.y - gesture.current.startMid.y;

      setView({
        scale,
        tx: start.tx + dx,
        ty: start.ty + dy,
      });
    }
  }

  function onPointerUp(e) {
    if (!destPreviewUrl) return;
    pointers.current.delete(e.pointerId);

    const pts = Array.from(pointers.current.values());
    if (pts.length === 0) {
      gesture.current.startView = null;
      gesture.current.startDist = 0;
    } else if (pts.length === 1) {
      gesture.current.startView = { ...view };
    }
  }

  function onWheel(e) {
    if (!destPreviewUrl) return;
    e.preventDefault();

    const delta = e.deltaY;
    setView((v) => {
      const nextScale = clamp(v.scale * (delta > 0 ? 0.95 : 1.05), 0.5, 6);
      return { ...v, scale: nextScale };
    });
  }

  async function buildCroppedBlobFromView() {
    // cria canvas do recorte baseado na viewBox (a área central visível)
    const img = imgRef.current;
    const viewBox = viewRef.current;
    if (!img || !viewBox) throw new Error("Imagem não carregada");

    const boxRect = viewBox.getBoundingClientRect();
    const boxW = boxRect.width;
    const boxH = boxRect.height;

    // canvas do tamanho da caixa (o recorte que você “vê”)
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(boxW);
    canvas.height = Math.round(boxH);
    const ctx = canvas.getContext("2d");

    // desenha imagem com transform aplicado
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // centro da caixa
    ctx.translate(canvas.width / 2 + view.tx, canvas.height / 2 + view.ty);
    ctx.scale(view.scale, view.scale);
    // desenha imagem centrada
    ctx.drawImage(img, -imgNatural.w / 2, -imgNatural.h / 2, imgNatural.w, imgNatural.h);
    ctx.restore();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) throw new Error("Falha ao gerar imagem");
    return blob;
  }

  async function handleOKScan() {
    if (!destPreviewUrl) return alert("Envie uma foto primeiro.");
    try {
      setScanning(true);

      const blob = await buildCroppedBlobFromView();

      const fd = new FormData();
      fd.append("image", blob, "plate.jpg");

      const r = await apiFetch("/api/plate/scan", {
        method: "POST",
        body: fd,
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) return alert(j.error || "Falha ao ler placa.");

      const plate = normPlate(j.plate || "");
      if (!plate) return alert("Não consegui ler a placa. Tente outra foto.");

      setToPlate(plate);
    } catch (e) {
      alert(e?.message || "Erro ao processar foto.");
    } finally {
      setScanning(false);
    }
  }

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
            style={input}
            value={editing ? newPlate : myPlate || ""}
            onChange={(e) => setNewPlate(e.target.value)}
            disabled={!editing}
            placeholder="Ex: ABC1234 ou ABC1D23"
          />
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.7 }}>
            (antiga: ABC1234 • Mercosul: ABC1D23)
          </div>
        </div>

        {/* Whats */}
        <div style={{ marginTop: 14 }}>
          <div style={label}>Meu WhatsApp (com DDI, só números)</div>
          <div style={{ display: "flex", gap: 10 }}>
            <div
              style={{
                padding: "12px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.05)",
                fontWeight: 800,
                minWidth: 78,
                textAlign: "center",
              }}
            >
              BR +55
            </div>

            <input
              style={input}
              value={editing ? newWhatsappLocal : splitWhatsapp(myWhatsappFull || "")}
              onChange={(e) => setNewWhatsappLocal(e.target.value)}
              disabled={!editing}
              placeholder="11999998888"
            />
          </div>
        </div>

        {editing && (
          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={btn(true)} onClick={saveMine} disabled={!isLogged}>
              Salvar
            </button>
            <button
              style={btn(false)}
              onClick={() => {
                setEditing(false);
                setNewPlate(myPlate || "");
                setNewWhatsappLocal(splitWhatsapp(myWhatsappFull || ""));
              }}
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {/* Enviar */}
      <div style={{ marginTop: 18, ...box }}>
        <b>Enviar mensagem para outra placa</b>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={label}>Placa destino</div>
            <input
              style={input}
              value={toPlate}
              onChange={(e) => setToPlate(e.target.value)}
              placeholder="Ex: ABC1234 ou ABC1D23"
            />
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.7 }}>
              (antiga: ABC1234 • Mercosul: ABC1D23)
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={label}>Mensagem</div>
              <textarea
                style={{ ...input, minHeight: 120, resize: "vertical" }}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Escreva a mensagem..."
              />
            </div>

            <div style={{ marginTop: 14 }}>
              <button style={btn(true)} onClick={sendAndOpenChat} disabled={!isLogged || sending}>
                {sending ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>

          {/* Foto */}
          <div>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Foto da Placa</div>
            <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 10 }}>
              Envie uma foto. Depois ajuste com o dedo (mover/zoom) e clique em OK.
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <button style={btn(false)} onClick={pickDestImage} disabled={!isLogged}>
                Escolher foto
              </button>
              <button style={btn(true)} onClick={handleOKScan} disabled={!isLogged || scanning || !destPreviewUrl}>
                {scanning ? "Lendo..." : "OK"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={onDestFileChange}
              />
            </div>

            <div
              ref={viewRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={onWheel}
              style={{
                width: "100%",
                height: 260,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                overflow: "hidden",
                position: "relative",
                touchAction: "none",
              }}
            >
              {!destPreviewUrl && (
                <div style={{ opacity: 0.7, padding: 14 }}>Envie uma foto.</div>
              )}

              {destPreviewUrl && (
                <img
                  ref={imgRef}
                  src={destPreviewUrl}
                  alt="foto"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    // natural size
                    const w = img.naturalWidth || 1;
                    const h = img.naturalHeight || 1;
                    setImgNatural({ w, h });

                    // centraliza
                    setView({ tx: 0, ty: 0, scale: 1 });
                  }}
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: `translate(calc(-50% + ${view.tx}px), calc(-50% + ${view.ty}px)) scale(${view.scale})`,
                    transformOrigin: "center center",
                    maxWidth: "none",
                    maxHeight: "none",
                    userSelect: "none",
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {!verified && isLogged && (
        <div style={{ marginTop: 14, color: "#ffb" }}>
          Seu email ainda não está verificado. Vá em <b>Login</b> e confirme.
        </div>
      )}
    </div>
  );
}
