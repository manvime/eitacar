import { NextResponse } from "next/server";

// força Node runtime (precisa para lidar bem com multipart + fetch externo)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractBrazilPlate(text) {
  if (!text) return "";

  // normaliza para procurar padrões
  const t = String(text)
    .toUpperCase()
    .replace(/[\s\r\n\t]/g, " ")
    .replace(/[^\w]/g, " "); // troca pontuação por espaço

  // Padrões BR:
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

export async function POST(request) {
  try {
    // (Opcional, mas recomendado) exigir token para evitar abuso:
    // seu front já manda Authorization: Bearer <token>
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
      return NextResponse.json({ error: "Arquivo 'image' não enviado." }, { status: 400 });
    }

    // No Next, isso normalmente vem como File/Blob
    // vamos mandar como multipart/form-data para o OCR.Space
    const ocrForm = new FormData();
    ocrForm.append("apikey", apiKey);
    ocrForm.append("language", "por"); // pode trocar para "eng" se quiser
    ocrForm.append("isOverlayRequired", "false");
    ocrForm.append("detectOrientation", "true");
    ocrForm.append("OCREngine", "2"); // 2 costuma ser melhor
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
          error: "Não consegui identificar a placa. Tente outra foto (de frente, sem reflexo).",
          rawText: parsedText,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      plate,
      rawText: parsedText, // útil para debug (você pode remover depois)
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Erro interno no scan", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
