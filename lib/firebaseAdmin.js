import admin from "firebase-admin";
import fs from "fs";
import path from "path";

/**
 * Vercel (produção): use FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 (recomendado)
 * Alternativas:
 *  - FIREBASE_SERVICE_ACCOUNT_JSON (JSON puro)
 *  - Local/dev: FIREBASE_SERVICE_ACCOUNT_PATH (arquivo no projeto/PC)
 */
function loadServiceAccount() {
  // 1) Base64 (recomendado no Vercel)
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  if (b64 && b64.trim()) {
    try {
      const decoded = Buffer.from(b64, "base64").toString("utf8");
      return JSON.parse(decoded);
    } catch {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 definido, mas inválido (base64/JSON). Gere o base64 do arquivo contaA.json."
      );
    }
  }

  // 2) JSON direto (se você preferir)
  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (jsonRaw && jsonRaw.trim()) {
    try {
      return JSON.parse(jsonRaw);
    } catch {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_JSON definido, mas não é JSON válido. Cole o JSON completo (um único JSON)."
      );
    }
  }

  // 3) Dev/local: caminho do arquivo
  const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (saPath && saPath.trim()) {
    const full = path.isAbsolute(saPath)
      ? saPath
      : path.join(process.cwd(), saPath);

    if (!fs.existsSync(full)) {
      throw new Error(`Service account não encontrado: ${full}`);
    }
    return JSON.parse(fs.readFileSync(full, "utf8"));
  }

  // Nada configurado
  throw new Error(
    "Credencial do Firebase Admin não configurada. No Vercel use FIREBASE_SERVICE_ACCOUNT_JSON_BASE64."
  );
}

let _inited = false;

function ensureAdmin() {
  if (_inited && admin.apps.length) return admin;

  // se já inicializou em outro lugar
  if (admin.apps.length) {
    _inited = true;
    return admin;
  }

  const serviceAccount = loadServiceAccount();
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
  });

  _inited = true;
  return admin;
}

/**
 * PROXY para evitar "estourar" no build.
 * Só inicializa quando alguém realmente usar admin/db/auth.
 */
const adminProxy = new Proxy(
  {},
  {
    get(_target, prop) {
      const adm = ensureAdmin();
      const val = adm[prop];

      if (typeof val === "function") {
        const bound = val.bind(adm);
        // ✅ preserva propriedades estáticas (ex.: admin.firestore.FieldValue)
        Object.assign(bound, val);
        return bound;
      }
      return val;
    },
  }
);

let _dbReal = null;
export const db = new Proxy(
  {},
  {
    get(_target, prop) {
      const firestore = (_dbReal ||= ensureAdmin().firestore());
      const val = firestore[prop];
      return typeof val === "function" ? val.bind(firestore) : val;
    },
  }
);

let _authReal = null;
export const authAdmin = new Proxy(
  {},
  {
    get(_target, prop) {
      const auth = (_authReal ||= ensureAdmin().auth());
      const val = auth[prop];
      return typeof val === "function" ? val.bind(auth) : val;
    },
  }
);

export default adminProxy;
