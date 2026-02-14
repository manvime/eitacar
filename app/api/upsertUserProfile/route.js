import admin, { db } from "@/lib/firebaseAdmin";
import { requireVerified } from "@/lib/authServer";

export async function POST(request) {
  const decoded = await requireVerified(request);

  const uid = decoded.uid;
  const email = (decoded.email || "").toLowerCase();
  if (!email) return Response.json({ error: "Email ausente" }, { status: 400 });

  const now = admin.firestore.FieldValue.serverTimestamp();

  await db.collection("users").doc(uid).set(
    { email, updatedAt: now, createdAt: now },
    { merge: true }
  );

  const emailKey = email.replace(/\./g, ",");
  await db.collection("userIndex").doc(emailKey).set(
    { uid, email, updatedAt: now },
    { merge: true }
  );

  return Response.json({ ok: true });
}
