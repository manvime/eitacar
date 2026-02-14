import admin, { db } from "@/lib/firebaseAdmin";
import { requireVerified } from "@/lib/authServer";

function normPlate(p) {
  return String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

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
  const plate = normPlate(body.plate);

  let text;
  try { text = validateText(body.text); }
  catch (e) { return Response.json({ error: e.message }, { status: 400 }); }

  const vehicleSnap = await db.collection("vehicles").doc(plate).get();
  if (!vehicleSnap.exists) return Response.json({ error: "Placa não cadastrada" }, { status: 404 });

  const v = vehicleSnap.data();
  if (!v.optIn) return Response.json({ error: "Sem opt-in" }, { status: 412 });
  if (!v.ownerUid) return Response.json({ error: "Sem dono vinculado" }, { status: 412 });
  if (v.ownerUid === uid) return Response.json({ error: "Você é o dono desta placa" }, { status: 400 });

  const ownerUid = v.ownerUid;

  const q = await db.collection("threads")
    .where("plate", "==", plate)
    .where("participants", "array-contains", uid)
    .limit(20)
    .get();

  let threadId = null;
  q.forEach(doc => {
    const d = doc.data();
    if (Array.isArray(d.participants) && d.participants.includes(ownerUid)) threadId = doc.id;
  });

  const now = admin.firestore.FieldValue.serverTimestamp();

  if (!threadId) {
    const threadRef = await db.collection("threads").add({
      plate,
      participants: [uid, ownerUid],
      createdAt: now,
      lastMessageAt: now,
      status: "open",
    });
    threadId = threadRef.id;
  } else {
    await db.collection("threads").doc(threadId).update({ lastMessageAt: now });
  }

  await db.collection("threads").doc(threadId).collection("messages").add({
    fromUid: uid,
    text,
    createdAt: now
  });

  return Response.json({ threadId });
}
