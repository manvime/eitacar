"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { auth } from "@/lib/firebaseClient";
import { onAuthStateChanged, getIdToken } from "firebase/auth";

const SCAN_URL = "/api/plate/scan"; // ajuste se o seu endpoint tiver outro caminho

export default function BuscarPage() {
  const [user, setUser] = useState(null);

  const [placaDestino, setPlacaDestino] = useState("");
  const [mensagem, setMensagem] = useState("");

  // Foto / recorte (pan+zoom)
  const [imgUrl, setImgUrl] = useState("");
  const [imgObj, setImgObj] = useState(null); // Image() carregada
  const [scanMsg, setScanMsg] = useState(""); // erro/status do scan
  const [isScanning, setIsScanning] = useState(false);

  // Transform do recorte (aplicado na imagem)
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  // Tamanho do viewport (box onde a foto aparece)
  const cropRef = useRef(null);

  // Controle de pointers (drag / pinch)
  const pointersRef = useRef(new Map()); // id -> {x,y}
  const gestureRef = useRef({
    mode: "none", // "drag" | "pinch"
    startTx: 0,
    startTy: 0,
    startScale: 1,
    startDist: 0,
    startMid: { x: 0, y: 0 },
    startImgPoint: { x: 0, y: 0 }, // ponto da imagem sob o centro do pinch
  });

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u || null));
  }, []);

  // libera URL antiga (evita leak)
  useEffect(() => {
    return () => {
      if (imgUrl) URL.revokeObjectURL(imgUrl);
    };
  }, [imgUrl]);

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function resetCrop() {
    setScale(1);
    setTx(0);
    setTy(0);
  }

  async function onPickFile(e) {
    setScanMsg("");
    const file = e.target.files?.[0];
    if (!file) return;

    // URL para preview
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    const url = URL.createObjectURL(file);
    setImgUrl(url);

    // Carrega Image() para desenhar em canvas depois
    const img = new Image();
    img.onload = () => {
      setImgObj(img);
      // após carregar, centraliza num “fit” básico
      resetCrop();
      // um pequeno zoom inicial ajuda a enxergar melhor
      setScale(1.15);
    };
    img.onerror = () => setScanMsg("Não consegui carregar a imagem.");
    img.src = url;
  }

  // Converte coordenada de tela -> coordenada do container
  function getLocalPoint(clientX, clientY) {
    const el = cropRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  // Coordenada “na imagem” equivalente ao ponto do container (considerando transform atual)
  function containerPointToImagePoint(cx, cy, currentScale = scale, currentTx = tx, currentTy = ty) {
    // nossa imagem está posicionada no centro do container + translate(tx,ty) e scale
    const el = cropRef.current;
    if (!el || !imgObj) return { x: 0, y: 0 };

    const w = el.clientWidth;
    const h = el.clientHeight;

    const centerX = w / 2 + currentTx;
    const centerY = h / 2 + currentTy;

    // ponto no espaço “renderizado”
    const dx = cx - centerX;
    const dy = cy - centerY;

    // volta o scale
    const ix = dx / currentScale + imgObj.width / 2;
    const iy = dy / currentScale + imgObj.height / 2;

    return { x: ix, y: iy };
  }

  function onPointerDown(e) {
    if (!imgObj) return;

    e.currentTarget.setPointerCapture?.(e.pointerId);

    const p = getLocalPoint(e.clientX, e.clientY);
    pointersRef.current.set(e.pointerId, p);

    const pts = Array.from(pointersRef.current.values());
    if (pts.length === 1) {
      gestureRef.current.mode = "drag";
      gestureRef.current.startTx = tx;
      gestureRef.current.startTy = ty;
    } else if (pts.length >= 2) {
      gestureRef.current.mode = "pinch";
      const a = pts[0];
      const b = pts[1];

      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dist = Math.hypot(b.x - a.x, b.y - a.y);

      gestureRef.current.startScale = scale;
      gestureRef.current.startDist = dist;
      gestureRef.current.startTx = tx;
      gestureRef.current.startTy = ty;
      gestureRef.current.startMid = mid;

      // ponto da imagem que está sob o meio do pinch (para manter “ancorado”)
      gestureRef.current.startImgPoint = containerPointToImagePoint(mid.x, mid.y, scale, tx, ty);
    }
  }

  function onPointerMove(e) {
    if (!imgObj) return;
    if (!pointersRef.current.has(e.pointerId)) return;

    const p = getLocalPoint(e.clientX, e.clientY);
    pointersRef.current.set(e.pointerId, p);

    const pts = Array.from(pointersRef.current.values());

    if (gestureRef.current.mode === "drag" && pts.length === 1) {
      const p0 = pts[0];
      // delta em relação ao ponto inicial do drag
      // (como não guardamos o ponto inicial, usamos a diferença pela última posição)
      // -> para ficar suave, vamos atualizar com delta incremental
      // (usaremos movement aproximado: diferença com o último valor guardado já foi aplicado)
      // Aqui, melhor: usar delta com base no próprio ponteiro; mas como guardamos só atual,
      // vamos usar o evento.movementX/movementY quando disponível.
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;
      setTx((v) => v + dx);
      setTy((v) => v + dy);
      return;
    }

    if (pts.length >= 2) {
      gestureRef.current.mode = "pinch";
      const a = pts[0];
      const b = pts[1];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dist = Math.hypot(b.x - a.x, b.y - a.y);

      const startScale = gestureRef.current.startScale;
      const startDist = gestureRef.current.startDist || 1;
      let newScale = startScale * (dist / startDist);
      newScale = clamp(newScale, 1, 6);

      // manter o mesmo ponto da imagem “sob o dedo” (mid)
      const imgPoint = gestureRef.current.startImgPoint;
      // queremos tx/ty tal que containerPointToImagePoint(mid) = imgPoint
      // invertendo a função:
      // mid.x = (w/2 + tx) + (imgPoint.x - imgW/2)*newScale
      // tx = mid.x - w/2 - (imgPoint.x - imgW/2)*newScale
      const el = cropRef.current;
      const w = el?.clientWidth || 1;
      const h = el?.clientHeight || 1;

      const desiredTx =
        mid.x - w / 2 - (imgPoint.x - imgObj.width / 2) * newScale;
      const desiredTy =
        mid.y - h / 2 - (imgPoint.y - imgObj.height / 2) * newScale;

      setScale(newScale);
      setTx(desiredTx);
      setTy(desiredTy);
    }
  }

  function onPointerUp(e) {
    pointersRef.current.delete(e.pointerId);

    const pts = Array.from(pointersRef.current.values());
    if (pts.length === 0) {
      gestureRef.current.mode = "none";
    } else if (pts.length === 1) {
      gestureRef.current.mode = "drag";
      gestureRef.current.startTx = tx;
      gestureRef.current.startTy = ty;
    }
  }

  // desenha exatamente o que está aparecendo no box e manda para OCR
  async function handleOkScan() {
    setScanMsg("");
    if (!user) {
      setScanMsg("Faça login para usar o scan.");
      return;
    }
    if (!imgObj) {
      setScanMsg("Escolha uma foto primeiro.");
      return;
    }

    const el = cropRef.current;
    if (!el) return;

    try {
      setIsScanning(true);

      const w = el.clientWidth;
      const h = el.clientHeight;

      // canvas do tamanho do box (o “recorte” final)
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(w));
      canvas.height = Math.max(1, Math.floor(h));
      const ctx = canvas.getContext("2d");

      // fundo preto
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // desenha a imagem com a mesma transform que está na tela:
      // centro do canvas + translate(tx,ty), scale, e a imagem centralizada
      ctx.save();
      ctx.translate(canvas.width / 2 + tx, canvas.height / 2 + ty);
      ctx.scale(scale, scale);
      ctx.drawImage(imgObj, -imgObj.width / 2, -imgObj.height / 2);
      ctx.restore();

      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92)
      );

      if (!blob) {
        setScanMsg("Falha ao preparar a imagem.");
        return;
      }

      const token = await getIdToken(user, true);

      const fd = new FormData();
      fd.append("file", blob, "plate.jpg");

      const res = await fetch(SCAN_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: fd,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setScanMsg(data?.error || `Erro no scan (${res.status}).`);
        return;
      }

      const plate = (data?.plate || "").toUpperCase().trim();
      if (!plate) {
        setScanMsg("Não consegui ler a placa. Tente outra foto (mais nítida, de frente).");
        return;
      }

      setPlacaDestino(plate);
      setScanMsg("");
    } catch (e) {
      setScanMsg(e?.message || "Erro no scan.");
    } finally {
      setIsScanning(false);
    }
  }

  const styles = useMemo(() => {
    const btn = {
      padding: "10px 14px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.15)",
      background: "rgba(255,255,255,0.10)",
      color: "white",
      fontWeight: 700,
      cursor: "pointer",
    };

    const input = {
      width: "100%",
      padding: 12,
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.15)",
      background: "rgba(255,255,255,0.06)",
      color: "white",
      outline: "none",
    };

    const card = {
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 14,
      padding: 14,
      background: "rgba(255,255,255,0.03)",
    };

    return { btn, input, card };
  }, []);

  if (!user) {
    return (
      <div style={{ padding: 16, color: "white" }}>
        Você precisa estar logado para usar o Buscar.
      </div>
    );
  }

  return (
    <div style={{ padding: 16, color: "white" }}>
      <div style={{ maxWidth: 1100 }}>
        <h2 style={{ margin: "8px 0 14px 0" }}>Buscar placa e enviar mensagem</h2>

        <div style={{ ...styles.card, marginBottom: 14 }}>
          <b>Enviar mensagem para outra placa</b>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr",
              gap: 14,
              marginTop: 12,
            }}
          >
            {/* ESQUERDA: placa destino + mensagem */}
            <div>
              <div style={{ marginBottom: 8, fontWeight: 700 }}>Placa destino</div>
              <input
                style={styles.input}
                value={placaDestino}
                onChange={(e) => setPlacaDestino(e.target.value.toUpperCase())}
                placeholder="Ex: ABC1234 ou ABC1D23"
              />
              <div style={{ opacity: 0.7, fontSize: 12, marginTop: 6 }}>
                (antiga: ABC1234 • Mercosul: ABC1D23)
              </div>

              <div style={{ marginTop: 16, marginBottom: 8, fontWeight: 700 }}>Mensagem</div>
              <textarea
                style={{ ...styles.input, minHeight: 120, resize: "vertical" }}
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                placeholder="Digite sua mensagem..."
              />
            </div>

            {/* DIREITA: foto da placa (pan/zoom com dedo) */}
            <div style={styles.card}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Foto da Placa</div>
              <div style={{ opacity: 0.8, fontSize: 13, marginBottom: 10 }}>
                Envie uma foto bem nítida (sem reflexo, de frente). <br />
                Depois ajuste com o dedo (mover/zoom) e clique em <b>OK</b>.
              </div>

              <div
                ref={cropRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                style={{
                  width: "100%",
                  height: 190,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.55)",
                  overflow: "hidden",
                  touchAction: "none", // essencial para pinch/drag no mobile
                  position: "relative",
                  userSelect: "none",
                }}
              >
                {!imgUrl ? (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: 0.7,
                      fontSize: 14,
                      textAlign: "center",
                      padding: 12,
                    }}
                  >
                    Nenhuma foto selecionada
                  </div>
                ) : (
                  <img
                    src={imgUrl}
                    alt="Foto da placa"
                    draggable={false}
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      transform: `translate(-50%, -50%) translate(${tx}px, ${ty}px) scale(${scale})`,
                      transformOrigin: "center center",
                      willChange: "transform",
                      maxWidth: "none",
                      maxHeight: "none",
                      width: "auto",
                      height: "auto",
                    }}
                  />
                )}
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <label
                  style={{
                    ...styles.btn,
                    flex: 1,
                    textAlign: "center",
                    background: "rgba(255,255,255,0.08)",
                  }}
                >
                  Escolher foto
                  <input
                    type="file"
                    accept="image/*"
                    onChange={onPickFile}
                    style={{ display: "none" }}
                  />
                </label>

                <button
                  onClick={handleOkScan}
                  disabled={isScanning}
                  style={{
                    ...styles.btn,
                    flex: 1,
                    opacity: isScanning ? 0.6 : 1,
                  }}
                >
                  {isScanning ? "Lendo..." : "OK"}
                </button>
              </div>

              {scanMsg && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid rgba(255,0,0,0.25)",
                    background: "rgba(255,0,0,0.12)",
                    color: "white",
                    fontSize: 13,
                  }}
                >
                  {scanMsg}
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <button style={styles.btn}>Enviar e abrir chat</button>
          </div>
        </div>
      </div>
    </div>
  );
}
