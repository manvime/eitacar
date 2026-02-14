import { NextResponse } from "next/server";
import admin from "firebase-admin";

function initAdmin() {
  if (admin.apps.length) return;
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

async function getUidFromAuth(req) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    initAdmin();
    const decoded = await admin.auth().verifyIdToken(m[1]);
    return decoded.uid;
  } catch {
    return null;
  }
}

function normPlate(s) {
  return (s || "")
    .toString()
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function toE164(digitsOnly) {
  // você está guardando só dígitos; aqui vira E.164 com +
  const d = (digitsOnly || "").replace(/\D/g, "");
  if (!d) return "";
  return d.startsWith("+" ) ? d : `+${d}`;
}

async function sendWhatsAppNotification({ toDigits, fromPlate, text, threadId }) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const to = toDigits.replace(/\D/g, "");
  if (!to) return;

  const body =
    `📩 Você recebeu uma mensagem no Placa Chat\n` +
    `De: ${fromPlate}\n` +
    `Mensagem: ${text}\n` +
    `Abrir chat: ${baseUrl}/t/${threadId}`;

  const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to, // sem "+" aqui é aceito (digits). Se quiser com +, use toE164.
      type: "text",
      text: { body },
    }),
  });

  // Se der erro, não quebra o app — só loga
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    console.error("WhatsApp API error:", resp.status, t);
  }
}

export async function POST(req) {
  const uid = await getUidFromAuth(req);
  if (!uid) return NextResponse.json({ error: "Sem token" }, { status: 401 });

  initAdmin();
  const db = admin.firestore();

  const body = await req.json().catch(() => ({}));
  const fromPlate = normPlate(body.fromPlate);
  const toPlate = normPlate(body.toPlate);
  const text = (body.text || "").toString().trim();

  if (!fromPlate || !toPlate || !text) {
    return NextResponse.json(
      { error: "fromPlate, toPlate e text são obrigatórios" },
      { status: 400 }
    );
  }

  // Garante que o user realmente “tem” a fromPlate (segurança)
  const userDoc = await db.collection("users").doc(uid).get();
  const myPlate = normPlate(userDoc.exists ? userDoc.data()?.myPlate : "");
  if (!myPlate || myPlate !== fromPlate) {
    return NextResponse.json(
      { error: "Você não tem permissão para usar essa placa como remetente." },
      { status: 403 }
    );
  }

  // valida destino existe
  const vDoc = await db.collection("vehicles").doc(toPlate).get();
  if (!vDoc.exists) {
    return NextResponse.json({ error: "Placa destino não cadastrada." }, { status: 404 });
  }
  const v = vDoc.data() || {};

  const threadId = [fromPlate, toPlate].sort().join("__");
  const threadRef = db.collection("threads").doc(threadId);

  // cria/atualiza thread
  await threadRef.set(
    {
      threadId,
      participantsPlates: [fromPlate, toPlate],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // salva mensagem
  const msgRef = await threadRef.collection("messages").add({
    fromPlate,
    toPlate,
    text,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // WhatsApp: só se dono do destino opt-in e tem whatsapp
  const toWhatsappDigits = (v.whatsapp || "").toString().replace(/\D/g, "");
  const optIn = !!v.optIn;

  if (optIn && toWhatsappDigits) {
    // Em ambiente de teste da Meta, o número precisa estar como “test recipient”
    sendWhatsAppNotification({
      toDigits: toWhatsappDigits,
      fromPlate,
      text,
      threadId,
    }).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    threadId,
    messageId: msgRef.id,
    whatsappNotified: optIn && !!toWhatsappDigits,
  });
}
