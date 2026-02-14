import { NextResponse } from "next/server";
import admin, { db } from "@/lib/firebaseAdmin";

/**
 * Lê o Bearer token e retorna uid. Mantém mensagens claras pra debug.
 */
async function getUidFromAuth(req) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return { uid: null, reason: "missing_header" };

  try {
    const decoded = await admin.auth().verifyIdToken(m[1]);
    return { uid: decoded.uid, reason: null };
  } catch (e) {
    console.error("[vehicles/claim] verifyIdToken failed:", e?.message || e);
    return { uid: null, reason: "invalid_token" };
  }
}

function normPlate(s) {
  return (s || "")
    .toString()
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normWhatsapp(s) {
  return (s || "").toString().replace(/\D/g, "");
}

export async function GET(req) {
  const { uid, reason } = await getUidFromAuth(req);
  if (!uid) {
    return NextResponse.json({ error: "Sem token", reason }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);

  // /api/vehicles/claim?mine=1
  if (searchParams.get("mine") === "1") {
    const userDoc = await db.collection("users").doc(uid).get();
    const data = userDoc.exists ? userDoc.data() : {};
    return NextResponse.json({
      plate: data?.myPlate || "",
      whatsapp: data?.whatsapp || "",
      email: data?.email || "",
    });
  }

  // /api/vehicles/claim?plate=ABC1234
  const plate = normPlate(searchParams.get("plate"));
  if (!plate) {
    return NextResponse.json({ error: "plate obrigatório" }, { status: 400 });
  }

  const vDoc = await db.collection("vehicles").doc(plate).get();
  if (!vDoc.exists) {
    return NextResponse.json({ exists: false }, { status: 200 });
  }

  const v = vDoc.data() || {};
  return NextResponse.json({
    exists: true,
    plate,
    ownerUid: v.ownerUid || null,
    whatsapp: v.whatsapp || "",
    optIn: !!v.optIn,
    updatedAt: v.updatedAt || null,
  });
}

export async function POST(req) {
  const { uid, reason } = await getUidFromAuth(req);
  if (!uid) {
    return NextResponse.json({ error: "Sem token", reason }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const plate = normPlate(body.plate);
  const whatsapp = normWhatsapp(body.whatsapp);

  if (!plate) {
    return NextResponse.json({ error: "plate obrigatório" }, { status: 400 });
  }

  // Atualiza/Cria o veículo
  await db.collection("vehicles").doc(plate).set(
    {
      plate,
      ownerUid: uid,
      whatsapp: whatsapp || "",
      optIn: !!whatsapp,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Salva “minha placa” no user
  await db.collection("users").doc(uid).set(
    {
      myPlate: plate,
      whatsapp: whatsapp || "",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true, plate, whatsapp });
}
