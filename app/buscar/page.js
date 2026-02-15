"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebaseClient";

export default function BuscarPage() {
  const router = useRouter();

  const [userEmail, setUserEmail] = useState("");
  const [verified, setVerified] = useState(false);

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

  // foto placa destino
  const fileInputRef = useRef(null);
  const [destFile, setDestFile] = useState(null);
  const [destPreviewUrl, setDestPreviewUrl] = useState("");
  const [scanning, setScanning] = useState(false);

  // pan/zoom
  const cropBoxRef = useRef(null);
  const imgNaturalRef = useRef({ w: 0, h: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 }); // px
  const [zoom, setZoom] = useState(1); // 1..5

  // pointers (touch/mouse)
  const pointersRef = useRef(new Map());
  const gestureRef = useRef({
    mode: "none",
    startPan: { x: 0, y: 0 },
    startZoom: 1,
    startDist: 0,
    startMid: { x: 0, y: 0 },
  });

  const isLogged = !!auth.currentUser;

  // ===== helpers =====
  function normPlate(s) {
    return (s || "")
      .toString()
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  function splitWhatsapp(full) {
    const digits = String(full || "").replace(/\D/g, "");
    if (!digits) return "";
    // remove 55 se tiver
    return digits.startsWith("55") ? digits.slice(2) : digits;
  }

  function normWhatsappLocal(local) {
    const only = String(local || "").replace(/\D/g, "");
    if (!only) return "";
    return `55${only}`; // salva com 55
  }

  // ✅ pega token NA HORA e manda Authorization certo
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

    const whatsapp = normWhatsappLocal(newWhatsappLocal);

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

  // ===== auth listener =====
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

  // cleanup preview url
  useEffect(() => {
    return () => {
      if (destPreviewUrl) URL.revokeObjectURL(destPreviewUrl);
    };
  }, [destPreviewUrl]);

  // ===== UI styles =====
  const box = useMemo(
    () => ({
      border: "1px solid rgba(255,255,255,0.15)",
      background: "rgba(255,255,255,0.04)",
      borderRadius: 12,
      padding: 16,
    }),
    []
  );

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

  const textarea = { ...input, resize: "vertical", minHeight: 140 };

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

  // ===== Foto: escolher =====
  function pickDestImage() {
    if (fileInputRef.current) fileInputRef.current.click();
  }

  async function onDestFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;

    setDestFile(f);
    const url = URL.createObjectURL(f);
    setDestPreviewUrl(url);

    // reset pan/zoom
    setPan({ x: 0, y: 0 });
    setZoom(1);

    // pega natural size
    const img = new Image();
    img.onload = () => {
      imgNaturalRef.current = { w: img.width, h: img.height };
    };
    img.src = url;
  }

  // ===== Gestos: pan/zoom com dedo =====
  function getBoxPoint(e) {
    const el = cropBoxRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
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

    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = getBoxPoint(e);
    pointersRef.current.set(e.pointerId, p);

    const pts = [...pointersRef.current.values()];
    if (pts.length === 1) {
      gestureRef.current.mode = "pan";
      gestureRef.current.startPan = { ...pan };
    } else if (pts.length >= 2) {
      gestureRef.current.mode = "pinch";
      gestureRef.current.startZoom = zoom;
      gestureRef.current.startDist = dist(pts[0], pts[1]);
      gestureRef.current.startMid = mid(pts[0], pts[1]);
      gestureRef.current.startPan = { ...pan };
    }
  }

  function onPointerMove(e) {
    if (!destPreviewUrl) return;
    if (!pointersRef.current.has(e.pointerId)) return;

    const p = getBoxPoint(e);
    pointersRef.current.set(e.pointerId, p);

    const pts = [...pointersRef.current.values()];
    const g = gestureRef.current;

    if (g.mode === "pan" && pts.length === 1) {
      const cur = pts[0];
      const start = cur; // mesmo ponto (pan simples baseado no movementX/Y não é confiável)
      // melhor: usa movement (mouse) quando existir, senão faz delta por último:
      // vamos fazer delta por evento guardando "prev" no map:
      // (já está atualizado, então pega "movement" do evento quando existir)
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;
      if (dx || dy) setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    }

    if (g.mode === "pinch" && pts.length >= 2) {
      const d = dist(pts[0], pts[1]);
      const m = mid(pts[0], pts[1]);

      const ratio = g.startDist ? d / g.startDist : 1;
      const newZoom = clamp(g.startZoom * ratio, 1, 5);

      // pan acompanha o movimento do “meio” do pinch
      const mdx = m.x - g.startMid.x;
      const mdy = m.y - g.startMid.y;

      setZoom(newZoom);
      setPan({ x: g.startPan.x + mdx, y: g.startPan.y + mdy });
    }
  }

  function onPointerUp(e) {
    pointersRef.current.delete(e.pointerId);
    const pts = [...pointersRef.current.values()];
    if (pts.length === 0) gestureRef.current.mode = "none";
  }

  // desktop: wheel zoom
  function onWheel(e) {
    if (!destPreviewUrl) return;
    e.preventDefault();
    const delta = e.deltaY;
    setZoom((z) => clamp(z * (delta > 0 ? 0.92 : 1.08), 1, 5));
  }

  // ===== OK: recorta o que está visível e manda pro OCR =====
  async function buildCroppedBlobFromView() {
    const el = cropBoxRef.current;
    if (!el) throw new Error("Box não encontrado.");
    const { w: iw, h: ih } = imgNaturalRef.current;
    if (!iw || !ih) throw new Error("Imagem ainda carregando.");

    const rect = el.getBoundingClientRect();
    const cw = Math.max(1, Math.round(rect.width));
    const ch = Math.max(1, Math.round(rect.height));

    // canvas em resolução maior (melhor OCR)
    const scaleOut = 2;
    const canvas = document.createElement("canvas");
    canvas.width = cw * scaleOut;
    canvas.height = ch * scaleOut;
    const ctx = canvas.getContext("2d");

    // desenha com a mesma lógica do preview:
    // baseScale = cover
    const baseScale = Math.max(cw / iw, ch / ih);
    const baseW = iw * baseScale;
    const baseH = ih * baseScale;

    const finalScale = zoom;
    const drawW = baseW * finalScale;
    const drawH = baseH * finalScale;

    const ox = (cw - drawW) / 2 + pan.x;
    const oy = (ch - drawH) / 2 + pan.y;

    // aplica escala do canvas
    ctx.scale(scaleOut, scaleOut);

    const img = new Image();
    img.src = destPreviewUrl;
    await new Promise((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Falha ao carregar imagem"));
    });

    ctx.drawImage(img, ox, oy, drawW, drawH);

    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.92));
    if (!blob) throw new Error("Falha ao gerar imagem.");
    return blob;
  }

  async function handleOKScan() {
    try {
      if (!isLogged) return alert("Você precisa estar logado.");
      if (!destPreviewUrl) return alert("Escolha uma foto primeiro.");

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
            value={editing ? newPlate : myPlate || ""}
            onChange={(e) => setNewPlate(e.target.value)}
            disabled={!editing}
            placeholder="Ex: ABC1234 ou ABC1D23"
            style={{ ...input, opacity: editing ? 1 : 0.95 }}
          />
        </div>

        {/* WhatsApp */}
        <div style={{ marginTop: 14 }}>
          <div style={label}>Meu WhatsApp (com DDI, só números)</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={smallBadge}>BR +55</div>
            <input
              value={editing ? newWhatsappLocal : splitWhatsapp(myWhatsappFull)}
              onChange={(e) => setNewWhatsappLocal(e.target.value)}
              disabled={!editing}
              placeholder="Ex: 11999999999"
              style={input}
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

        <div style={{ marginTop: 10 }}>
          <div style={label}>Placa destino</div>

          <div style={{ display: "flex", gap: 12, alignItems: "stretch", flexWrap: "wrap" }}>
            {/* Digitar */}
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

            {/* Foto da placa (mover/zoom com dedo) */}
            <div style={{ flex: "0 0 360px" }}>
              <div
                style={{
                  ...box,
                  padding: 12,
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ fontWeight: 800 }}>Foto da Placa</div>
                <div style={{ opacity: 0.8, fontSize: 13 }}>
                  Envie um foto. Depois ajuste com o dedo (mover/zoom) e clique em OK.
                </div>

                <div
                  ref={cropBoxRef}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onWheel={onWheel}
                  style={{
                    width: "100%",
                    height: 170,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    overflow: "hidden",
                    background: "rgba(255,255,255,0.03)",
                    position: "relative",
                    touchAction: "none", // ✅ permite pinch/drag no mobile
                    userSelect: "none",
                  }}
                >
                  {destPreviewUrl ? (
                    <img
                      src={destPreviewUrl}
                      alt="Prévia"
                      draggable={false}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        transformOrigin: "center center",
                        pointerEvents: "none",
                      }}
                    />
                  ) : (
                    <div style={{ padding: 12, opacity: 0.75 }}>Envie um foto.</div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button style={btn(false)} onClick={pickDestImage} disabled={!isLogged || scanning}>
                    Escolher foto
                  </button>
                  <button
                    style={btn(true)}
                    onClick={handleOKScan}
                    disabled={!isLogged || scanning || !destPreviewUrl}
                    title="Recorta o que está aparecendo e lê a placa"
                  >
                    {scanning ? "Lendo..." : "OK"}
                  </button>

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
        </div>

        {/* mensagem */}
        <div style={{ marginTop: 14 }}>
          <div style={label}>Mensagem</div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Digite sua mensagem..."
            style={textarea}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <button style={btn(true)} onClick={sendAndOpenChat} disabled={sending || !isLogged}>
            {sending ? "Enviando..." : "Enviar e abrir chat"}
          </button>
        </div>
      </div>
    </div>
  );
}
