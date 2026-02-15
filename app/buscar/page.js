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
  const [myWhatsappFull, setMyWhatsappFull] = useState(""); // ex: 5511999999999

  const [editing, setEditing] = useState(false);
  const [newPlate, setNewPlate] = useState("");
  const [newWhatsappLocal, setNewWhatsappLocal] = useState(""); // sem +55 (só números)

  const [toPlate, setToPlate] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // ===== Upload placa destino (foto) + CROP =====
  const fileInputRef = useRef(null);
  const [destFile, setDestFile] = useState(null);
  const [destPreviewUrl, setDestPreviewUrl] = useState("");
  const [scanning, setScanning] = useState(false);

  // Crop UI state
  const cropBoxRef = useRef(null);
  const imgRef = useRef(null);
  const [imgReady, setImgReady] = useState(false);

  const [zoom, setZoom] = useState(1); // multiplicador do baseScale
  const [baseScale, setBaseScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // px
  const dragRef = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    startOffX: 0,
    startOffY: 0,
  });

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

  // ===== Upload + OCR (destino) com CROP =====
  function pickDestImage() {
    if (fileInputRef.current) fileInputRef.current.click();
  }

  function resetCropForNewImage() {
    setImgReady(false);
    setZoom(1);
    setBaseScale(1);
    setOffset({ x: 0, y: 0 });
  }

  function onDestFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;

    setDestFile(f);
    resetCropForNewImage();

    const url = URL.createObjectURL(f);
    setDestPreviewUrl(url);

    // ⚠️ NÃO processa automaticamente.
    // O usuário vai ajustar (mover/zoom) e clicar OK para recortar e ler.
  }

  function computeInitialTransform() {
    const box = cropBoxRef.current;
    const img = imgRef.current;
    if (!box || !img) return;

    const W = box.clientWidth;
    const H = box.clientHeight;

    const nw = img.naturalWidth || 1;
    const nh = img.naturalHeight || 1;

    // cover: garante que não apareça “vazio” no crop
    const bs = Math.max(W / nw, H / nh);
    const scale = bs * 1;

    const x = (W - nw * scale) / 2;
    const y = (H - nh * scale) / 2;

    setBaseScale(bs);
    setZoom(1);
    setOffset({ x, y });
    setImgReady(true);
  }

  function clampOffset(next) {
    // opcional: você pode limitar para não “sumir” a imagem.
    // aqui deixo livre (mais simples). Se quiser clamp, eu faço depois.
    return next;
  }

  function onPointerDown(e) {
    if (!imgReady) return;
    dragRef.current.dragging = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startY = e.clientY;
    dragRef.current.startOffX = offset.x;
    dragRef.current.startOffY = offset.y;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    setOffset((prev) =>
      clampOffset({
        x: dragRef.current.startOffX + dx,
        y: dragRef.current.startOffY + dy,
      })
    );
  }

  function onPointerUp() {
    dragRef.current.dragging = false;
  }

  function onWheel(e) {
    if (!imgReady) return;
    e.preventDefault();

    // zoom suave no wheel
    const delta = e.deltaY > 0 ? -0.06 : 0.06;
    setZoom((z) => {
      const nz = Math.min(3, Math.max(1, +(z + delta).toFixed(3)));
      return nz;
    });
  }

  function zoomIn() {
    setZoom((z) => Math.min(3, +(z + 0.1).toFixed(3)));
  }
  function zoomOut() {
    setZoom((z) => Math.max(1, +(z - 0.1).toFixed(3)));
  }
  function centerImage() {
    // recentraliza mantendo zoom atual
    const box = cropBoxRef.current;
    const img = imgRef.current;
    if (!box || !img) return;

    const W = box.clientWidth;
    const H = box.clientHeight;

    const nw = img.naturalWidth || 1;
    const nh = img.naturalHeight || 1;

    const scale = baseScale * zoom;
    const x = (W - nw * scale) / 2;
    const y = (H - nh * scale) / 2;
    setOffset({ x, y });
  }

  function makeCroppedBlob() {
    const box = cropBoxRef.current;
    const img = imgRef.current;
    if (!box || !img) return null;

    const W = Math.max(1, Math.floor(box.clientWidth));
    const H = Math.max(1, Math.floor(box.clientHeight));

    const scale = baseScale * zoom;
    const nw = img.naturalWidth || 1;
    const nh = img.naturalHeight || 1;

    // canvas em “boa resolução”
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // desenha exatamente o que o usuário está vendo no crop box
    ctx.drawImage(img, 0, 0, nw, nh, offset.x, offset.y, nw * scale, nh * scale);

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob),
        "image/jpeg",
        0.92
      );
    });
  }

  async function scanDestPlateFromCrop() {
    try {
      if (!destFile || !destPreviewUrl) return alert("Escolha uma foto primeiro.");
      if (!imgReady) return alert("Aguarde a imagem carregar.");

      setScanning(true);

      const blob = await makeCroppedBlob();
      if (!blob) return alert("Não consegui recortar a imagem.");

      const fd = new FormData();
      fd.append("image", blob, "plate-crop.jpg");

      const r = await apiFetch("/api/plate/scan", {
        method: "POST",
        body: fd,
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        return alert(j.error || "OCR não configurado (crie /api/plate/scan).");
      }

      const plate = normPlate(j.plate || "");
      if (!plate) return alert("Não consegui ler a placa no recorte. Ajuste e tente de novo.");

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

      setUserEmail((u.email || "").toLowerCase());
      setVerified(!!u.emailVerified);

      try {
        await loadMine();
      } catch (e) {
        // se não tiver carro cadastrado ainda, segue
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    return () => {
      if (destPreviewUrl) URL.revokeObjectURL(destPreviewUrl);
    };
  }, [destPreviewUrl]);

  const isLogged = !!userEmail;

  const styles = useMemo(() => {
    const input = {
      width: "100%",
      padding: 12,
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(255,255,255,0.06)",
      color: "white",
      outline: "none",
      fontSize: 16,
    };

    const card = {
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 16,
      padding: 16,
      background: "rgba(255,255,255,0.03)",
    };

    const btn = {
      padding: "10px 14px",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(255,255,255,0.06)",
      color: "white",
      fontWeight: 700,
      cursor: "pointer",
    };

    const btnGhost = {
      ...btn,
      background: "transparent",
    };

    return { input, card, btn, btnGhost };
  }, []);

  return (
    <div style={{ padding: 16, maxWidth: 1000, margin: "0 auto", color: "white" }}>
      <div style={{ marginBottom: 12, fontSize: 18, fontWeight: 800 }}>
        Buscar placa e enviar mensagem
      </div>

      <div style={{ opacity: 0.9, marginBottom: 12 }}>
        <div>Usuário: {userEmail || "-"}</div>
        <div>Email verificado: {String(verified)}</div>
      </div>

      {/* Carro cadastrado */}
      <div style={styles.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>✅ Seu carro cadastrado</div>
          <div style={{ flex: 1 }} />
          <button onClick={() => setEditing((v) => !v)} style={styles.btnGhost}>
            {editing ? "Fechar" : "Editar"}
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Minha placa</div>
            <input
              style={styles.input}
              value={editing ? newPlate : myPlate}
              onChange={(e) => setNewPlate(e.target.value)}
              disabled={!editing}
              placeholder="Ex: ABC1234 ou ABC1D23"
            />
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>
              Meu WhatsApp (com DDI, só números)
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
              <div
                style={{
                  minWidth: 74,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(255,255,255,0.06)",
                  padding: "8px 10px",
                  fontWeight: 900,
                  lineHeight: 1.1,
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.9 }}>BR</div>
                <div style={{ fontSize: 14 }}>+55</div>
              </div>

              <input
                style={styles.input}
                value={editing ? newWhatsappLocal : splitWhatsapp(myWhatsappFull)}
                onChange={(e) => setNewWhatsappLocal(e.target.value)}
                disabled={!editing}
                inputMode="numeric"
                placeholder="Ex: 11999999999"
              />
            </div>
          </div>
        </div>

        {editing && (
          <button onClick={saveMine} style={{ ...styles.btn, marginTop: 12 }}>
            Salvar
          </button>
        )}
      </div>

      {/* Enviar mensagem */}
      <div style={{ ...styles.card, marginTop: 16 }}>
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 12 }}>
          Enviar mensagem para outra placa
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.7fr 1fr",
            gap: 14,
            alignItems: "start",
          }}
        >
          {/* Placa destino */}
          <div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Placa destino</div>
            <input
              style={styles.input}
              value={toPlate}
              onChange={(e) => setToPlate(e.target.value)}
              placeholder="Ex: ABC1234 ou ABC1D23"
            />
            <div style={{ marginTop: 6, opacity: 0.75, fontSize: 13 }}>
              (antiga: ABC1234 • Mercosul: ABC1D23)
            </div>
          </div>

          {/* Foto + Crop */}
          <div style={styles.card}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>
              Foto da Placa
            </div>
            <div style={{ opacity: 0.85, fontSize: 13, marginBottom: 10 }}>
              Envie uma foto bem nítida (sem reflexo, de frente).
              <br />
              Depois ajuste (mover/zoom) e clique em <b>OK</b>.
            </div>

            {/* Preview + crop box */}
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
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(0,0,0,0.35)",
                overflow: "hidden",
                position: "relative",
                touchAction: "none",
                userSelect: "none",
              }}
              title="Arraste para centralizar. Use o scroll do mouse ou o slider para zoom."
            >
              {!destPreviewUrl ? (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: 0.7,
                    fontWeight: 700,
                  }}
                >
                  Nenhuma foto selecionada
                </div>
              ) : (
                <>
                  <img
                    ref={imgRef}
                    src={destPreviewUrl}
                    alt="preview"
                    onLoad={() => computeInitialTransform()}
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      transform: `translate(${offset.x}px, ${offset.y}px) scale(${baseScale * zoom})`,
                      transformOrigin: "0 0",
                      willChange: "transform",
                      pointerEvents: "none",
                    }}
                  />

                  {/* overlay (moldura leve) */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 10,
                      borderRadius: 10,
                      border: "1px dashed rgba(255,255,255,0.22)",
                      boxShadow: "0 0 0 999px rgba(0,0,0,0.25) inset",
                      pointerEvents: "none",
                    }}
                  />
                </>
              )}
            </div>

            {/* Controles de zoom */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
              <button onClick={zoomOut} style={styles.btnGhost} disabled={!destPreviewUrl}>
                –
              </button>

              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                disabled={!destPreviewUrl}
                style={{ width: "100%" }}
              />

              <button onClick={zoomIn} style={styles.btnGhost} disabled={!destPreviewUrl}>
                +
              </button>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button onClick={pickDestImage} style={styles.btn}>
                Escolher foto
              </button>

              <button
                onClick={centerImage}
                style={styles.btnGhost}
                disabled={!destPreviewUrl}
                title="Centralizar"
              >
                Centralizar
              </button>

              <button
                onClick={scanDestPlateFromCrop}
                style={styles.btn}
                disabled={!destPreviewUrl || scanning}
                title="Recorta o que está no box e envia pro OCR"
              >
                {scanning ? "Lendo..." : "OK (Recortar e Ler)"}
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={onDestFileChange}
            />
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Mensagem</div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            style={{
              ...styles.input,
              minHeight: 120,
              resize: "vertical",
              fontFamily: "inherit",
            }}
            placeholder="Digite sua mensagem..."
          />
        </div>

        <button
          onClick={sendAndOpenChat}
          disabled={sending || !isLogged}
          style={{ ...styles.btn, marginTop: 12 }}
        >
          {sending ? "Enviando..." : "Enviar e abrir chat"}
        </button>
      </div>
    </div>
  );
}
