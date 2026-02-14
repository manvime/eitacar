import admin, { db } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/authServer";

function normPlate(p) {
  return String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

export async function POST(request) {
  await requireAdmin(request);

  const body = await request.json();
  const plate = normPlate(body.plate);
  const model = String(body.model || "").trim();
  const year = Number(body.year || 0);
  const ownerEmail = String(body.ownerEmail || "").toLowerCase().trim();
  const ownerPhone = String(body.ownerPhone || "").replace(/[^0-9]/g, "");
  const optIn = Boolean(body.optIn);

  if (plate.length < 6 || plate.length > 8) return Response.json({ error: "Placa inválida" }, { status: 400 });
  if (!model) return Response.json({ error: "Modelo obrigatório" }, { status: 400 });
  if (!year || year < 1950 || year > 2100) return Response.json({ error: "Ano inválido" }, { status: 400 });
  if (!ownerEmail) return Response.json({ error: "Email do dono obrigatório" }, { status: 400 });
  if (!ownerPhone) return Response.json({ error: "WhatsApp do dono obrigatório" }, { status: 400 });
  if (!optIn) return Response.json({ error: "Opt-in obrigatório" }, { status: 412 });

  const emailKey = ownerEmail.replace(/\./g, ",");
  const idx = await db.collection("userIndex").doc(emailKey).get();
  if (!idx.exists) return Response.json({ error: "Dono não encontrado (ele precisa se cadastrar e verificar email)" }, { status: 404 });

  const ownerUid = idx.data().uid;
  const now = admin.firestore.FieldValue.serverTimestamp();

  await db.collection("vehicles").doc(plate).set({
    plate,
    model,
    year,
    ownerUid,
    ownerPhone,
    optIn: true,
    optInAt: now,
    optInMethod: "checkbox",
    updatedAt: now,
  }, { merge: true });

  return Response.json({ ok: true });
}
