import { db } from "@/lib/firebaseAdmin";
import { requireVerified } from "@/lib/authServer";

export async function POST(request) {
  const decoded = await requireVerified(request);
  const uid = decoded.uid;

  const body = await request.json();
  const threadId = String(body.threadId || "").trim();
  if (!threadId) return Response.json({ error: "threadId obrigatório" }, { status: 400 });

  const threadRef = db.collection("threads").doc(threadId);
  const snap = await threadRef.get();
  if (!snap.exists) return Response.json({ error: "Thread não existe" }, { status: 404 });

  const t = snap.data();

  if (!Array.isArray(t.participants) || !t.participants.includes(uid)) {
    return Response.json({ error: "Sem acesso" }, { status: 403 });
  }

  const msgsSnap = await threadRef
    .collection("messages")
    .orderBy("createdAt", "asc")
    .limit(200)
    .get();

  const messages = msgsSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  return Response.json({
    thread: { id: snap.id, ...t },
    messages,
  });
}
