"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import "@/lib/firebaseClient";
import { useRouter } from "next/navigation";

export default function BuscarPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // ---- dados do usuário (seu app pode já ter isso em outra API; aqui é só UI) ----
  const [myPlate, setMyPlate] = useState("");
  const [myWhatsapp, setMyWhatsapp] = useState(""); // somente números sem +55
  const [plateDest, setPlateDest] = useState("");
  const [message, setMessage] = useState("");

  // ---- Foto + OCR ----
  const fileInputRef = useRef(null);
  const imgRef = useRef(null);

  const [imgUrl, setImgUrl] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState("");

  // viewport (área visível = recorte)
  const viewportRef = useRef(null);
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });

  // transform do usuário
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // translate em px

  // pointers (para pinch)
  const pointersRef = useRef(new Map());
  const pinchRef = useRef({
    startDist: 0,
    startScale: 1,
    startMid: { x: 0, y: 0 },
    startPos: { x: 0, y: 0 },
  });

  // ---- Auth guard ----
  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setLoadingAuth(false);
    });
  }, []);

  useEffect(() => {
    if (!loadingAuth && !user) router.push("/login");
  }, [loadingAuth, user, router]);

  // ---- helpers ----
  const btnBase = {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.10)",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
  };
  const btnOutline = { ...btnBase, background: "transparent" };

  const inputStyle = {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    outline: "none",
  };

  const cardStyle = {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 14,
    padding: 16,
    background: "rgba(255,255,255,0.03)",
  };

  const normalizePlate = (s) =>
    (s || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 7);

  // ---- Foto: escolher ----
  const onPickFile = async (file) => {
    setOcrError("");
    if (!file) return;

    const url = URL.createObjectURL(file);
    setImgUrl(url);

    // reset transform
    setScale(1);
    setPos({ x: 0, y: 0 });

    // pega dimensões naturais ao carregar
    setTimeout(() => {
      const img = imgRef.current;
      if (!img) return;
      img.onload = () => {
        setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
        // centraliza inicialmente
        centerImage();
      };
    }, 0);
  };

  const centerImage = () => {
    const vp = viewportRef.current;
    const img = imgRef.current;
    if (!vp || !img) return;

    const vpW = vp.clientWidth;
    const vpH = vp.clientHeight;

    // ajusta escala inicial para preencher melhor o viewport
    // (cover)
    const iw = img.naturalWidth || 1;
    const ih = img.naturalHeight || 1;
    const sCover = Math.max(vpW / iw, vpH / ih);
    const s = Math.min(Math.max(sCover, 1), 5);

    setScale(s);

    // centraliza (imagem no meio do viewport)
    const scaledW = iw * s;
    const scaledH = ih * s;
    setPos({
      x: (vpW - scaledW) / 2,
      y: (vpH - scaledH) / 2,
    });
  };

  // ---- Interação touch/mouse: pan + pinch ----
  const getPoint = (e) => ({ x: e.clientX, y: e.clientY });

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const onPointerDown = (e) => {
    if (!imgUrl) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, getPoint(e));

    const pts = Array.from(pointersRef.current.values());
    if (pts.length === 2) {
      const d = dist(pts[0], pts[1]);
      const m = mid(pts[0], pts[1]);
      pinchRef.current = {
        startDist: d,
        startScale: scale,
        startMid: m,
        startPos: { ...pos },
      };
    }
  };

  const onPointerMove = (e) => {
    if (!imgUrl) return;
    if (!pointersRef.current.has(e.pointerId)) return;

    const prev = pointersRef.current.get(e.pointerId);
    const cur = getPoint(e);
    pointersRef.current.set(e.pointerId, cur);

    const pts = Array.from(pointersRef.current.values());

    // 1 dedo: pan
    if (pts.length === 1) {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      setPos((p) => ({ x: p.x + dx, y: p.y + dy }));
      return;
    }

    // 2 dedos: pinch-zoom + pan pelo “meio”
    if (pts.length === 2) {
      const pr = pinchRef.current;
      const dNow = dist(pts[0], pts[1]);
      const mNow = mid(pts[0], pts[1]);

      let newScale = (pr.startScale * dNow) / (pr.startDist || 1);
      newScale = Math.min(Math.max(newScale, 1), 8);

      // deslocamento do meio (pan)
      const mdx = mNow.x - pr.startMid.x;
      const mdy = mNow.y - pr.startMid.y;

      // zoom em torno do centro do viewport (boa sensação no mobile)
      setScale(newScale);
      setPos({
        x: pr.startPos.x + mdx,
        y: pr.startPos.y + mdy,
      });
    }
  };

  const onPointerUp = (e) => {
    if (!imgUrl) return;
    pointersRef.current.delete(e.pointerId);
  };

  // ---- OK: recortar o que está visível e enviar ao OCR ----
  const doCropAndOcr = async () => {
    try {
      setOcrError("");
      if (!imgRef.current || !viewportRef.current) return;

      setOcrBusy(true);

      const vp = viewportRef.current;
      const img = imgRef.current;

      const vpW = vp.clientWidth;
      const vpH = vp.clientHeight;

      const iw = img.naturalWidth;
      const ih = img.naturalHeight;

      // canvas do recorte final (o que o usuário está vendo no viewport)
      const canvas = document.createElement("canvas");
      canvas.width = vpW;
      canvas.height = vpH;
      const ctx = canvas.getContext("2d");

      // A imagem está desenhada com transform: translate(pos) scale(scale)
      // No canvas, precisamos “desfazer” para pegar a área correta.
      // Desenho: img em (pos.x, pos.y) com tamanho (iw*scale, ih*scale)
      // No viewport: recorte começa em (0,0) até (vpW,vpH)
      // Então desenhar a imagem no canvas com o mesmo transform é suficiente:
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, vpW, vpH);
      ctx.drawImage(img, pos.x, pos.y, iw * scale, ih * scale);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      if (!blob) throw new Error("Falha ao gerar recorte");

      const form = new FormData();
      form.append("image", blob, "plate.jpg");

      // ajuste aqui se seu endpoint tiver outro nome
      const res = await fetch("/api/plate/scan", {
        method: "POST",
        body: form,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || `OCR falhou (${res.status})`);
      }

      const plate = normalizePlate(data?.plate || "");
      if (!plate) throw new Error("Não consegui ler a placa. Tente outra foto mais nítida.");

      setPlateDest(plate);
    } catch (err) {
      setOcrError(err?.message || "Erro no OCR");
    } finally {
      setOcrBusy(false);
    }
  };

  // ---- UI ----
  const isReady = !!user && !loadingAuth;

  const whatsappBox = useMemo(() => {
    // só números, sem +55
    const cleaned = (myWhatsapp || "").replace(/\D/g, "").slice(0, 11);
    return cleaned;
  }, [myWhatsapp]);

  if (!isReady) {
    return (
      <div style={{ minHeight: "70vh", display: "grid", placeItems: "center", color: "white" }}>
        Carregando...
      </div>
    );
  }

  return (
    <div style={{ padding: 18, color: "white", maxWidth: 1050, margin: "0 auto" }}>
      <div style={{ margin: "22px 0 14px", opacity: 0.95 }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Buscar placa e enviar mensagem</div>
      </div>

      {/* Seu carro cadastrado */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>✅ Seu carro cadastrado</div>
          <div style={{ flex: 1 }} />
          <button style={btnOutline}>Editar</button>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ opacity: 0.9, marginBottom: 8 }}>Minha placa</div>
          <input
            style={inputStyle}
            value={myPlate}
            onChange={(e) => setMyPlate(normalizePlate(e.target.value))}
            placeholder="Ex: ABC1234 ou ABC1D23"
          />
        </div>

        <div>
          <div style={{ opacity: 0.9, marginBottom: 8 }}>Meu WhatsApp (com DDI, só números)</div>
          <div style={{ display: "flex", gap: 10 }}>
            <div
              style={{
                width: 74,
                minWidth: 74,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "0 10px",
                userSelect: "none",
              }}
            >
              <span style={{ fontWeight: 800, letterSpacing: 0.5 }}>BR</span>
              <span style={{ opacity: 0.9 }}>+55</span>
            </div>

            <input
              style={inputStyle}
              value={whatsappBox}
              onChange={(e) => setMyWhatsapp(e.target.value)}
              placeholder="Ex: 11999998888"
              inputMode="numeric"
            />
          </div>
        </div>
      </div>

      <div style={{ height: 16 }} />

      {/* Enviar mensagem */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 14 }}>Enviar mensagem para outra placa</div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 0.9fr",
            gap: 16,
            alignItems: "start",
          }}
        >
          {/* esquerda */}
          <div>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Placa destino</div>
            <input
              style={inputStyle}
              value={plateDest}
              onChange={(e) => setPlateDest(normalizePlate(e.target.value))}
              placeholder="Ex: ABC1234 ou ABC1D23"
            />
            <div style={{ marginTop: 8, opacity: 0.75, fontSize: 12 }}>
              (antiga: ABC1234 • Mercosul: ABC1D23)
            </div>
          </div>

          {/* direita - foto + ajuste */}
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 14,
              padding: 14,
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 16 }}>Foto da Placa</div>
            <div style={{ marginTop: 6, opacity: 0.85, fontSize: 13, lineHeight: 1.25 }}>
              Envie uma foto bem nítida (sem reflexo, de frente).
              <br />
              Depois ajuste com o dedo (mover/zoom) e clique em <b>OK</b>.
            </div>

            {/* viewport = crop (sem quadro extra) */}
            <div
              ref={viewportRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{
                marginTop: 10,
                width: "100%",
                aspectRatio: "16/9",
                borderRadius: 12,
                overflow: "hidden",
                background: "rgba(0,0,0,0.45)",
                border: "1px solid rgba(255,255,255,0.10)",
                touchAction: "none", // necessário p/ pinch + pan funcionar bem no mobile
                position: "relative",
              }}
              title="Arraste e use dois dedos para dar zoom"
            >
              {!imgUrl ? (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "grid",
                    placeItems: "center",
                    opacity: 0.7,
                    fontSize: 13,
                  }}
                >
                  Nenhuma foto selecionada
                </div>
              ) : (
                <img
                  ref={imgRef}
                  src={imgUrl}
                  alt="Foto enviada"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
                    transformOrigin: "top left",
                    willChange: "transform",
                    userSelect: "none",
                    WebkitUserDrag: "none",
                    pointerEvents: "none", // os gestures ficam no container
                  }}
                  draggable={false}
                />
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => onPickFile(e.target.files?.[0])}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button style={{ ...btnOutline, flex: 1 }} onClick={() => fileInputRef.current?.click()}>
                Escolher foto
              </button>

              <button
                style={{ ...btnBase, flex: 1, opacity: imgUrl ? 1 : 0.5 }}
                onClick={doCropAndOcr}
                disabled={!imgUrl || ocrBusy}
              >
                {ocrBusy ? "Lendo..." : "OK"}
              </button>
            </div>

            {ocrError && (
              <div
                style={{
                  marginTop: 10,
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(255,80,80,0.35)",
                  background: "rgba(255,80,80,0.10)",
                  fontSize: 13,
                }}
              >
                {ocrError}
              </div>
            )}
          </div>
        </div>

        <div style={{ height: 16 }} />

        <div style={{ fontWeight: 800, marginBottom: 8 }}>Mensagem</div>
        <textarea
          style={{
            ...inputStyle,
            minHeight: 120,
            resize: "vertical",
            lineHeight: 1.3,
          }}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Digite sua mensagem..."
        />

        <div style={{ marginTop: 12 }}>
          <button style={btnOutline}>Enviar e abrir chat</button>
        </div>
      </div>
    </div>
  );
}
