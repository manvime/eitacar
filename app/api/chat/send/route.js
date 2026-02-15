import { NextResponse } from "next/server";
import crypto from "crypto";

function normPlate(s) {
  return (s || "").toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function getUidFromAuth(req) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;

  const { authAdmin } = await import("@/lib/firebaseAdmin");
  try {
    const decoded = await authAdmin.verifyIdToken(m[1]);
    return decoded.uid;
  } catch {
    return null;
  }
}

async function sendWhatsAppNotification({ toDigits, fromPlate, text, threadId }) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const to = (toDigits || "").replace(/\D/g, "");
  if (!to) return;

  const body =
    `📩 Você recebeu uma mensagem no eitaCar\n` +
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
      to,
      type: "text",
      text: { body },
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    console.error("WhatsApp API error:", resp.status, t);
  }
}

async function sendPushToUser({ uid, title, body, data }) {
  const { db, default: admin } = await import("@/lib/firebaseAdmin");

  // pega tokens salvos do usuário
  const snap = await db.collection("users").doc(uid).collection("pushTokens").get();
  const tokens = snap.docs.map((d) => d.data()?.token).filter(Boolean);

  if (!tokens.length) return { ok: false, reason: "no_tokens" };

  // manda multicast
  const resp = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: data || {},
  });

  // limpa tokens inválidos
  const deletes = [];
  resp.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code || "";
      const invalid =
        code.includes("registration-token-not-registered") ||
        code.includes("invalid-argument");
      if (invalid) {
        const token = tokens[i];
        const id = crypto.createHash("sha256").update(token).digest("hex");
        deletes.push(db.collection("users").doc(uid).collection("pushTokens").doc(id).delete());
      }
    }
  });
  if (deletes.length) await Promise.allSettled(deletes);

  return { ok: true, successCount: resp.successCount, failureCount: resp.failureCount };
}

export async function POST(req) {
  const uid = await getUidFromAuth(req);
  if (!uid) return NextResponse.json({ error: "Sem token" }, { status: 401 });

  const { db, default: admin } = await import("@/lib/firebaseAdmin");

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

  // segurança: o usuário só pode enviar usando a própria placa
  const userDoc = await db.collection("users").doc(uid).get();
  const myPlate = normPlate(userDoc.exists ? userDoc.data()?.myPlate : "");
  if (!myPlate || myPlate !== fromPlate) {
    return NextResponse.json(
      { error: "Você não tem permissão para usar essa placa como remetente." },
      { status: 403 }
    );
  }

  // valida destino
  const vDoc = await db.collection("vehicles").doc(toPlate).get();
  if (!vDoc.exists) {
    return NextResponse.json({ error: "Placa destino não cadastrada." }, { status: 404 });
  }
  const v = vDoc.data() || {};
  const ownerUid = v.ownerUid || null;

  const threadId = [fromPlate, toPlate].sort().join("__");
  const threadRef = db.collection("threads").doc(threadId);

  await threadRef.set(
    {
      threadId,
      participantsPlates: [fromPlate, toPlate],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastText: text,
      lastFrom: fromPlate,
    },
    { merge: true }
  );

  const msgRef = await threadRef.collection("messages").add({
    fromPlate,
    toPlate,
    text,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // ✅ WhatsApp (se opt-in + tem número)
  const toWhatsappDigits = (v.ownerPhone || v.whatsapp || "").toString().replace(/\D/g, "");
  const optIn = !!v.optIn;

  if (optIn && toWhatsappDigits) {
    sendWhatsAppNotification({ toDigits: toWhatsappDigits, fromPlate, text, threadId }).catch(() => {});
  }

  // ✅ PUSH (notificação estilo WhatsApp/SMS)
  let push = { ok: false, reason: "no_owner" };
  if (ownerUid) {
    push = await sendPushToUser({
      uid: ownerUid,
      title: `Mensagem da placa ${fromPlate}`,
      body: text.length > 120 ? text.slice(0, 117) + "..." : text,
      data: { threadId },
    }).catch((e) => ({ ok: false, reason: e?.message || "push_error" }));
  }

  return NextResponse.json({
    ok: true,
    threadId,
    messageId: msgRef.id,
    whatsappNotified: optIn && !!toWhatsappDigits,
    push,
  });
}
