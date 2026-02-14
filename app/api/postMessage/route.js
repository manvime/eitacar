import admin, { db } from "@/lib/firebaseAdmin";
import { requireVerified } from "@/lib/authServer";

function validateText(text) {
  const t = String(text || "").trim();
  if (t.length < 1 || t.length > 500) throw new Error("Texto deve ter 1 a 500 caracteres.");
  if (/(https?:\/\/|www\.|\.com\b|\.br\b)/i.test(t)) throw new Error("Não é permitido enviar links.");
  if (/(\+?55)?\s?\(?\d{2}\)?\s?\d{4,5}\-?\d{4}/.test(t)) throw new Error("Não é permitido enviar telefone.");
  return t;
}

export async function POST(request) {
  const decoded = await requireVerified(request);
  const uid = decoded.uid;

  const body = await request.json();
  const threadId = String(body.threadId || "").trim();

  let text;
  try { text = validateText(body.text); }
  catch (e) { return Response.json({ error: e.message }, { status: 400 }); }

  const threadRef = db.collection("threads").doc(threadId);
  const snap = await threadRef.get();
  if (!snap.exists) return Response.json({ error: "Thread não existe" }, { status: 404 });

  const t = snap.data();
  if (!t.participants?.includes(uid)) return Response.json({ error: "Sem acesso" }, { status: 403 });

  const now = admin.firestore.FieldValue.serverTimestamp();
  await threadRef.update({ lastMessageAt: now });

  await threadRef.collection("messages").add({
    fromUid: uid,
    text,
    createdAt: now
  });

  return Response.json({ ok: true });
}
