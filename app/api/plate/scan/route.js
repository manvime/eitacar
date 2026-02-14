import { NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractBrazilPlate(text) {
  if (!text) return "";

  const t = String(text)
    .toUpperCase()
    .replace(/[\s\r\n\t]/g, " ")
    .replace(/[^\w]/g, " ");

  // Antiga: ABC1234
  const reOld = /\b([A-Z]{3}\d{4})\b/g;
  // Mercosul: ABC1D23
  const reMercosul = /\b([A-Z]{3}\d[A-Z]\d{2})\b/g;

  // Prioriza Mercosul
  const m1 = [...t.matchAll(reMercosul)];
  if (m1.length) return m1[0][1];

  const m2 = [...t.matchAll(reOld)];
  if (m2.length) return m2[0][1];

  // tentativa extra (sem espaços)
  const compact = t.replace(/\s+/g, "");
  const m3 = compact.match(/([A-Z]{3}\d[A-Z]\d{2}|[A-Z]{3}\d{4})/);
  return m3 ? m3[1] : "";
}

async function centerCropForPlate(buffer) {
  // Crop central para reduzir “muitos carros” na foto.
  // Ajuste fácil aqui se quiser:
  // - cropWPercent: 0.7 => pega 70% da largura
  // - cropHPercent: 0.45 => pega 45% da altura
  const cropWPercent = 0.7;
  const cropHPercent = 0.45;

  const img = sharp(buffer);
  const meta = await img.metadata();
  if (!meta.width || !meta.height) return buffer;

  const w = meta.width;
  const h = meta.height;

  const cropW = Math.max(1, Math.floor(w * cropWPercent));
  const cropH = Math.max(1, Math.floor(h * cropHPercent));
  const left = Math.max(0, Math.floor((w - cropW) / 2));
  const top = Math.max(0, Math.floor((h - cropH) / 2));

  const out = await img
    .extract({ left, top, width: cropW, height: cropH })
    .jpeg({ quality: 90 })
    .toBuffer();

  return out;
}

export async function POST(request) {
  try {
    // Recomendo manter: evita abuso do endpoint
    const authHeader = request.headers.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json({ error: "Sem token" }, { status: 401 });
    }

    const apiKey = process.env.OCR_SPACE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OCR_SPACE_API_KEY não definido nas variáveis de ambiente." },
        { status: 500 }
      );
    }

    const form = await request.formData();
    const file = form.get("image");

    if (!file) {
      return NextResponse.json(
        { error: "Envie a imagem no campo 'image' (multipart/form-data)." },
        { status: 400 }
      );
    }

    // Converte File/Blob -> Buffer
    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // Crop central (melhora quando tem muitos carros)
    let croppedBuffer = inputBuffer;
    try {
      croppedBuffer = await centerCropForPlate(inputBuffer);
    } catch {
      // se sharp falhar por algum motivo, segue sem crop
      croppedBuffer = inputBuffer;
    }

    // Monta form para OCR.Space
    const ocrForm = new FormData();
    ocrForm.append("apikey", apiKey);
    ocrForm.append("language", "por");
    ocrForm.append("isOverlayRequired", "false");
    ocrForm.append("detectOrientation", "true");
    ocrForm.append("OCREngine", "2");
    ocrForm.append("scale", "true");

    // Buffer -> Blob (jpeg)
    const blob = new Blob([croppedBuffer], { type: "image/jpeg" });
    ocrForm.append("file", blob, "plate-crop.jpg");

    const resp = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body: ocrForm,
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok || !data) {
      return NextResponse.json(
        { error: "Falha no OCR.Space", details: data || null },
        { status: 502 }
      );
    }

    if (data.IsErroredOnProcessing) {
      return NextResponse.json(
        { error: data.ErrorMessage || "OCR retornou erro", details: data },
        { status: 422 }
      );
    }

    const parsedText =
      data?.ParsedResults?.map((r) => r?.ParsedText || "").join("\n") || "";

    const plate = extractBrazilPlate(parsedText);

    if (!plate) {
      return NextResponse.json(
        {
          error:
            "Não consegui identificar a placa. Tente foto de frente, sem reflexo e mais próxima.",
          rawText: parsedText, // útil para debug (pode remover depois)
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ plate });
  } catch (err) {
    return NextResponse.json(
      { error: "Erro interno no scan", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
