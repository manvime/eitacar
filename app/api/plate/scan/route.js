import { NextResponse } from "next/server";

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

  // extra: compacto
  const compact = t.replace(/\s+/g, "");
  const m3 = compact.match(/([A-Z]{3}\d[A-Z]\d{2}|[A-Z]{3}\d{4})/);
  return m3 ? m3[1] : "";
}

export async function POST(request) {
  try {
    // (Recomendado) exigir token pra evitar abuso
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

    const ct = (request.headers.get("content-type") || "").toLowerCase();

    let file = null;
    let imageBase64 = "";

    // ✅ Aceita multipart/form-data (campo: image)
    if (ct.includes("multipart/form-data")) {
      const form = await request.formData();
      file = form.get("image");
      if (!file) {
        return NextResponse.json(
          { error: "Envie o arquivo 'image' (multipart) ou 'imageBase64' (json/form)." },
          { status: 400 }
        );
      }
    }
    // ✅ Aceita JSON { imageBase64: "data:image/jpeg;base64,..." }
    else if (ct.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      imageBase64 = String(body?.imageBase64 || "").trim();
      if (!imageBase64) {
        return NextResponse.json(
          { error: "Envie o arquivo 'image' (multipart) ou 'imageBase64' (json/form)." },
          { status: 400 }
        );
      }
      // se vier só o base64 puro, tenta prefixar
      if (!imageBase64.startsWith("data:image/")) {
        imageBase64 = `data:image/jpeg;base64,${imageBase64}`;
      }
    }
    // ✅ Aceita x-www-form-urlencoded / form simples (imageBase64)
    else if (ct.includes("application/x-www-form-urlencoded")) {
      const form = await request.formData();
      imageBase64 = String(form.get("imageBase64") || "").trim();
      if (!imageBase64) {
        return NextResponse.json(
          { error: "Envie o arquivo 'image' (multipart) ou 'imageBase64' (json/form)." },
          { status: 400 }
        );
      }
      if (!imageBase64.startsWith("data:image/")) {
        imageBase64 = `data:image/jpeg;base64,${imageBase64}`;
      }
    } else {
      // tenta formData por padrão (alguns browsers mandam content-type diferente em edge cases)
      try {
        const form = await request.formData();
        file = form.get("image");
      } catch {}
      if (!file) {
        return NextResponse.json(
          { error: "Envie o arquivo 'image' (multipart) ou 'imageBase64' (json/form)." },
          { status: 400 }
        );
      }
    }

    // Monta payload pro OCR.Space
    const ocrForm = new FormData();
    ocrForm.append("apikey", apiKey);
    ocrForm.append("language", "por");
    ocrForm.append("isOverlayRequired", "false");
    ocrForm.append("detectOrientation", "true");
    ocrForm.append("OCREngine", "2");
    ocrForm.append("scale", "true");

    if (file) {
      ocrForm.append("file", file, file?.name || "plate.jpg");
    } else {
      // OCR.Space usa "base64Image"
      ocrForm.append("base64Image", imageBase64);
    }

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
            "Não consegui identificar a placa. Tente outra foto (de frente, sem reflexo).",
          rawText: parsedText,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ plate, rawText: parsedText });
  } catch (err) {
    return NextResponse.json(
      { error: "Erro interno no scan", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
