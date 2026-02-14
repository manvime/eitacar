import { NextResponse } from "next/server";

// Força Node runtime (precisa para lidar bem com multipart + fetch externo)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractBrazilPlate(text) {
  if (!text) return "";

  const t = String(text)
    .toUpperCase()
    .replace(/[\s\r\n\t]/g, " ")
    .replace(/[^\w]/g, " "); // troca pontuação por espaço

  // BR:
  // Antiga: ABC1234
  const reOld = /\b([A-Z]{3}\d{4})\b/g;
  // Mercosul: ABC1D23
  const reMercosul = /\b([A-Z]{3}\d[A-Z]\d{2})\b/g;

  // Prioriza Mercosul
  const m1 = [...t.matchAll(reMercosul)];
  if (m1.length) return m1[0][1];

  const m2 = [...t.matchAll(reOld)];
  if (m2.length) return m2[0][1];

  // tentativa extra: remover espaços e procurar de novo
  const compact = t.replace(/\s+/g, "");
  const m3 = compact.match(/([A-Z]{3}\d[A-Z]\d{2}|[A-Z]{3}\d{4})/);
  return m3 ? m3[1] : "";
}

function base64ToFile(base64, filename = "plate.jpg") {
  // base64 pode vir como:
  // "data:image/jpeg;base64,...." ou só o "...."
  const cleaned = String(base64).trim();
  const match = cleaned.match(/^data:(.+);base64,(.*)$/);
  const mime = match?.[1] || "image/jpeg";
  const b64 = match?.[2] || cleaned;

  const bytes = Buffer.from(b64, "base64");
  // Node 18+ tem File nativo no runtime do Next (nodejs).
  return new File([bytes], filename, { type: mime });
}

export async function POST(request) {
  try {
    // Exigir token para evitar abuso
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

    const contentType = request.headers.get("content-type") || "";

    let file = null;

    // 1) multipart/form-data (recomendado)
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      file = form.get("image");

      // fallback: permitir base64 via form também
      if (!file) {
        const imageBase64 = form.get("imageBase64");
        if (imageBase64) file = base64ToFile(imageBase64, "plate.jpg");
      }
    } else {
      // 2) JSON: { imageBase64: "..." }
      const body = await request.json().catch(() => null);
      const imageBase64 = body?.imageBase64;
      if (imageBase64) file = base64ToFile(imageBase64, "plate.jpg");
    }

    if (!file) {
      return NextResponse.json(
        { error: "Envie o arquivo 'image' (multipart) ou 'imageBase64' (json/form)." },
        { status: 400 }
      );
    }

    // Envia para OCR.Space
    const ocrForm = new FormData();
    ocrForm.append("apikey", apiKey);
    ocrForm.append("language", "por");
    ocrForm.append("isOverlayRequired", "false");
    ocrForm.append("detectOrientation", "true");
    ocrForm.append("OCREngine", "2");
    ocrForm.append("scale", "true");
    ocrForm.append("file", file, file?.name || "plate.jpg");

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
            "Não consegui identificar a placa. Recorte só a placa e envie uma foto de frente, nítida e sem reflexo.",
          rawText: parsedText,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      plate,
      rawText: parsedText, // remova depois se quiser
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Erro interno no scan", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
