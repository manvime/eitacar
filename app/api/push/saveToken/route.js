// app/api/push/saveToken/route.js
import { NextResponse } from "next/server";
import crypto from "crypto";

function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

async function getUidFromAuth(req) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;

  // Import dinâmico (evita problemas no build do Next/Vercel)
  const { authAdmin } = await import("@/lib/firebaseAdmin");
  try {
    const decoded = await authAdmin.verifyIdToken(m[1]);
    return decoded.uid;
  } catch {
    return null;
  }
}

export async function POST(req) {
  const uid = await getUidFromAuth(req);
  if (!uid) return NextResponse.json({ error: "Sem token" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "").trim();
  const device = String(body.device || "web").trim(); // ex: "chrome", "android", "ios", etc.

  if (!token) {
    return NextResponse.json({ error: "token obrigatório" }, { status: 400 });
  }

  const { db, default: admin } = await import("@/lib/firebaseAdmin");

  const tokenId = sha256(token); // evita caracteres inválidos no docId
  const ref = db.collection("users").doc(uid).collection("pushTokens").doc(tokenId);

  // (opcional) preserva createdAt sem sobrescrever sempre
  const snap = await ref.get().catch(() => null);
  const createdAt = snap && snap.exists ? undefined : admin.firestore.FieldValue.serverTimestamp();

  const payload = {
    token,
    platform: "web",
    device: device || "web",
    userAgent: req.headers.get("user-agent") || "",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(createdAt ? { createdAt } : {}),
  };

  await ref.set(payload, { merge: true });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const uid = await getUidFromAuth(req);
  if (!uid) return NextResponse.json({ error: "Sem token" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "").trim();

  if (!token) {
    return NextResponse.json({ error: "token obrigatório" }, { status: 400 });
  }

  const { db } = await import("@/lib/firebaseAdmin");

  const tokenId = sha256(token);
  await db.collection("users").doc(uid).collection("pushTokens").doc(tokenId).delete();

  return NextResponse.json({ ok: true });
}
