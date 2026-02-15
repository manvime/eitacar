import { NextResponse } from "next/server";
import { getUidFromAuth } from "@/lib/auth";
import { db } from "@/lib/firebaseAdmin";

export async function POST(req) {
  try {
    const uid = await getUidFromAuth(req);
    const body = await req.json().catch(() => ({}));
    const token = (body.token || "").toString().trim();

    if (!uid) return NextResponse.json({ error: "Sem token" }, { status: 401 });
    if (!token) return NextResponse.json({ error: "token obrigatório" }, { status: 400 });

    const ref = db.collection("users").doc(uid);

    // remove token do mapa
    await ref.set(
      {
        pushTokens: { [token]: db.FieldValue?.delete?.() }, // pode não existir dependendo do seu wrapper
      },
      { merge: true }
    );

    // se seu wrapper não tem FieldValue, use admin.firestore.FieldValue.delete() dentro do firebaseAdmin export.

    // opcional: marcar disabled
    await ref.set(
      {
        pushEnabled: false,
        pushUpdatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Erro" }, { status: 500 });
  }
}
