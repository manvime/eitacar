import admin from "firebase-admin";
import fs from "fs";
import path from "path";

function initAdmin() {
  if (admin.apps.length) return admin;

  const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!saPath) throw new Error("FIREBASE_SERVICE_ACCOUNT_PATH não definido no .env.local");

  const full = path.isAbsolute(saPath) ? saPath : path.join(process.cwd(), saPath);
  if (!fs.existsSync(full)) throw new Error(`Service account não encontrado: ${full}`);

  const serviceAccount = JSON.parse(fs.readFileSync(full, "utf8"));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return admin;
}

const adm = initAdmin();

export default adm;          // ✅ agora existe default export
export const db = adm.firestore();
export const authAdmin = adm.auth();
