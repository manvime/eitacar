const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// Região SP (mesma do seu Firestore)
setGlobalOptions({ region: "southamerica-east1" });

admin.initializeApp();
const db = admin.firestore();

function requireVerified(auth) {
  if (!auth) throw new HttpsError("unauthenticated", "Faça login.");
  if (!auth.token?.email_verified) {
    throw new HttpsError(
      "failed-precondition",
      "Verifique seu email para usar o chat."
    );
  }
}

function requireAdmin(auth) {
  if (!auth?.token?.admin) throw new HttpsError("permission-denied", "Apenas admin.");
}

function normPlate(p) {
  return String(p || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function validateText(text) {
  const t = String(text || "").trim();
  if (t.length < 1 || t.length > 500) {
    throw new HttpsError("invalid-argument", "Texto deve ter 1 a 500 caracteres.");
  }
  // bloqueia links
  if (/(https?:\/\/|www\.|\.com\b|\.br\b)/i.test(t)) {
    throw new HttpsError("invalid-argument", "Não é permitido enviar links.");
  }
  // bloqueia telefone (BR simples)
  if (/(\+?55)?\s?\(?\d{2}\)?\s?\d{4,5}\-?\d{4}/.test(t)) {
    throw new HttpsError("invalid-argument", "Não é permitido enviar telefone.");
  }
  return t;
}

async function hitRateLimit(key, limit, windowSeconds) {
  const ref = db.collection("rateLimits").doc(key);
  await db.runTransaction(async (tx) => {
    const now = admin.firestore.Timestamp.now();
    const snap = await tx.get(ref);

    let count = 0;
    let resetAt = admin.firestore.Timestamp.fromMillis(0);

    if (snap.exists) {
      const d = snap.data();
      count = d.count || 0;
      resetAt = d.resetAt || resetAt;
    }

    // janela expirou -> reset
    if (resetAt.toMillis() <= now.toMillis()) {
      count = 0;
      resetAt = admin.firestore.Timestamp.fromMillis(
        now.toMillis() + windowSeconds * 1000
      );
    }

    count += 1;
    if (count > limit) {
      throw new HttpsError("resource-exhausted", "Limite excedido. Tente mais tarde.");
    }

    tx.set(ref, { count, resetAt }, { merge: true });
  });
}

// FUTURO: Integração WhatsApp (Twilio/Meta API). Por enquanto só loga.
async function notifyOwnerWhatsApp(ownerPhone, plate, threadUrl) {
  console.log("WA notify ->", ownerPhone, plate, threadUrl);
}

/**
 * Usuário verificado cria/atualiza perfil + índice por email (admin resolve UID depois)
 */
exports.upsertUserProfile = onCall(async (req) => {
  requireVerified(req.auth);

  const uid = req.auth.uid;
  const email = (req.auth.token.email || "").toLowerCase();
  if (!email) throw new HttpsError("failed-precondition", "Email ausente.");

  const now = admin.firestore.FieldValue.serverTimestamp();

  await db.collection("users").doc(uid).set(
    {
      email,
      updatedAt: now,
      createdAt: now,
    },
    { merge: true }
  );

  const emailKey = email.replace(/\./g, ",");
  await db.collection("userIndex").doc(emailKey).set(
    { uid, email, updatedAt: now },
    { merge: true }
  );

  return { ok: true };
});

/**
 * ADMIN: resolve UID de um usuário pelo email (ele precisa ter logado/verificado ao menos 1x)
 */
exports.adminResolveUidByEmail = onCall(async (req) => {
  requireAdmin(req.auth);

  const email = String(req.data.email || "").toLowerCase().trim();
  if (!email) throw new HttpsError("invalid-argument", "Email inválido.");

  const emailKey = email.replace(/\./g, ",");
  const snap = await db.collection("userIndex").doc(emailKey).get();
  if (!snap.exists) {
    throw new HttpsError(
      "not-found",
      "Usuário não encontrado. Ele já criou conta e verificou email?"
    );
  }

  return { uid: snap.data().uid };
});

/**
 * ADMIN: cadastra veículo e vincula dono (1 dono por placa)
 * Exige opt-in = true (autorização do dono)
 */
exports.adminUpsertVehicle = onCall(async (req) => {
  requireAdmin(req.auth);

  const plate = normPlate(req.data.plate);
  const model = String(req.data.model || "").trim();
  const year = Number(req.data.year || 0);
  const ownerEmail = String(req.data.ownerEmail || "").toLowerCase().trim();
  const ownerPhone = String(req.data.ownerPhone || "").replace(/[^0-9]/g, "");
  const optIn = Boolean(req.data.optIn);

  if (plate.length < 6 || plate.length > 8)
    throw new HttpsError("invalid-argument", "Placa inválida.");
  if (!model) throw new HttpsError("invalid-argument", "Modelo obrigatório.");
  if (!year || year < 1950 || year > 2100)
    throw new HttpsError("invalid-argument", "Ano inválido.");
  if (!ownerEmail)
    throw new HttpsError("invalid-argument", "Email do dono obrigatório.");
  if (!ownerPhone)
    throw new HttpsError("invalid-argument", "WhatsApp do dono obrigatório (55119...).");
  if (!optIn) throw new HttpsError("failed-precondition", "Opt-in deve estar marcado.");

  // resolve dono pelo índice
  const emailKey = ownerEmail.replace(/\./g, ",");
  const idx = await db.collection("userIndex").doc(emailKey).get();
  if (!idx.exists) {
    throw new HttpsError(
      "not-found",
      "Dono não encontrado. Ele precisa criar conta e verificar email."
    );
  }
  const ownerUid = idx.data().uid;

  const now = admin.firestore.FieldValue.serverTimestamp();

  await db.collection("vehicles").doc(plate).set(
    {
      plate,
      model,
      year,
      ownerUid,
      ownerPhone,
      optIn: true,
      optInAt: now,
      optInMethod: "checkbox",
      updatedAt: now,
    },
    { merge: true }
  );

  return { ok: true };
});

/**
 * Usuário (verificado) abre/acha thread pela placa e envia a 1ª mensagem
 */
exports.createOrOpenThreadAndSendFirstMessage = onCall(async (req) => {
  requireVerified(req.auth);

  const uid = req.auth.uid;
  const plate = normPlate(req.data.plate);
  const text = validateText(req.data.text);

  if (plate.length < 6 || plate.length > 8)
    throw new HttpsError("invalid-argument", "Placa inválida.");

  // anti-spam básico
  await hitRateLimit(`newThread:${uid}`, 3, 24 * 3600); // 3 por dia
  await hitRateLimit(`cooldown:${uid}`, 1, 10); // 1 a cada 10s

  const vehicleSnap = await db.collection("vehicles").doc(plate).get();
  if (!vehicleSnap.exists) throw new HttpsError("not-found", "Placa não cadastrada.");

  const v = vehicleSnap.data();
  if (!v.optIn)
    throw new HttpsError("failed-precondition", "Contato não autorizado (sem opt-in).");
  if (!v.ownerUid)
    throw new HttpsError("failed-precondition", "Placa sem dono vinculado.");
  if (v.ownerUid === uid)
    throw new HttpsError("invalid-argument", "Você é o dono desta placa.");

  const ownerUid = v.ownerUid;

  // procura thread existente entre uid e ownerUid para a mesma placa
  const q = await db
    .collection("threads")
    .where("plate", "==", plate)
    .where("participants", "array-contains", uid)
    .limit(20)
    .get();

  let threadId = null;
  q.forEach((doc) => {
    const d = doc.data();
    if (Array.isArray(d.participants) && d.participants.includes(ownerUid)) {
      threadId = doc.id;
    }
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
    createdAt: now,
  });

  // futuro: avisar dono via WhatsApp com link da conversa
  const base = process.env.APP_BASE_URL || "";
  if (v.ownerPhone && base) {
    const threadUrl = `${base}/t/${threadId}`;
    await notifyOwnerWhatsApp(v.ownerPhone, plate, threadUrl);
  }

  return { threadId };
});

/**
 * Usuário (verificado) envia mensagem numa thread que ele participa
 */
exports.postMessage = onCall(async (req) => {
  requireVerified(req.auth);

  const uid = req.auth.uid;
  const threadId = String(req.data.threadId || "").trim();
  const text = validateText(req.data.text);

  if (!threadId) throw new HttpsError("invalid-argument", "threadId inválido.");

  // anti-spam
  await hitRateLimit(`msgDay:${uid}`, 10, 24 * 3600); // 10 por dia
  await hitRateLimit(`cooldown:${uid}`, 1, 10); // 1 a cada 10s

  const threadRef = db.collection("threads").doc(threadId);
  const threadSnap = await threadRef.get();
  if (!threadSnap.exists) throw new HttpsError("not-found", "Conversa não encontrada.");

  const t = threadSnap.data();
  if (!t.participants?.includes(uid)) {
    throw new HttpsError("permission-denied", "Sem acesso.");
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  await threadRef.update({ lastMessageAt: now });

  await threadRef.collection("messages").add({
    fromUid: uid,
    text,
    createdAt: now,
  });

  return { ok: true };
});
