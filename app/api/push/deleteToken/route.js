// app/api/push/deleteToken/route.js
import { NextResponse } from "next/server";

// ✅ usando caminho relativo (não depende do alias @)
// Certifique-se que o arquivo está em /lib/firebaseAdmin.js
import adminProxy, { db, authAdmin } from "../../../../lib/firebaseAdmin";

async function requireUser(req) {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const idToken = match?.[1];

  if (!idToken) {
    throw new Error("Sem Authorization: Bearer <token>.");
  }

  // authAdmin vem do seu firebaseAdmin.js (lazy init)
  const decoded = await authAdmin.verifyIdToken(idToken);
  return decoded; // { uid, email, ... }
}

export async function POST(req) {
  try {
    const user = await requireUser(req);

    const body = await req.json().catch(() => ({}));
    const token = body?.token;

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { ok: false, error: "Campo 'token' é obrigatório (string)." },
        { status: 400 }
      );
    }

    // Modelo: users/{uid}/pushTokens/{token}
    await db
      .collection("users")
      .doc(user.uid)
      .collection("pushTokens")
      .doc(token)
      .delete();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("deleteToken error:", err);

    // se token inválido/expirado
    const msg = err?.message || "Erro interno";
    const isAuth =
      msg.includes("Authorization") ||
      msg.toLowerCase().includes("id token") ||
      msg.toLowerCase().includes("token");

    return NextResponse.json(
      { ok: false, error: msg },
      { status: isAuth ? 401 : 500 }
    );
  }
}
