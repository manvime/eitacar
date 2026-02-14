import { NextResponse } from "next/server";
import admin from "firebase-admin";
import fs from "fs";
import path from "path";

function initAdmin() {
  if (admin.apps.length) return;

  // Preferência: service account local (dev)
  // .env.local -> FIREBASE_SERVICE_ACCOUNT_PATH=C:\...\serviceAccountKey.json
  const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  try {
    if (saPath) {
      const full = path.isAbsolute(saPath) ? saPath : path.join(process.cwd(), saPath);
      const json = fs.readFileSync(full, "utf8");
      const serviceAccount = JSON.parse(json);

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      return;
    }

    // Fallback: ADC (só funciona se GOOGLE_APPLICATION_CREDENTIALS / gcloud estiver configurado)
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  } catch (e) {
    // Se der erro aqui, TODAS as rotas com verifyIdToken vão falhar
    console.error("[vehicles/claim] initAdmin failed:", e?.message || e);
    throw e;
  }
}

async function getUidFromAuth(req) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return { uid: null, reason: "missing_header" };

  try {
    initAdmin();
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
  // guarda só dígitos (ex: 5511999999999)
  return (s || "").toString().replace(/\D/g, "");
}

export async function GET(req) {
  const { uid, reason } = await getUidFromAuth(req);
  if (!uid) {
    // mantém "Sem token" como você já usa, mas com um extra pra debug
    return NextResponse.json(
      { error: "Sem token", reason },
      { status: 401 }
    );
  }

  initAdmin();
  const db = admin.firestore();
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
    return NextResponse.json(
      { error: "Sem token", reason },
      { status: 401 }
    );
  }

  initAdmin();
  const db = admin.firestore();

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
      optIn: !!whatsapp, // se cadastrou whatsapp => aceita notificação
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Salva “minha placa” no user (pra facilitar)
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
