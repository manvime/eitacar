// lib/firebaseClient.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";

// ===== Firebase init (CLIENT) =====
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

// Se faltar config, avisa (evita silêncio)
function warnMissingConfig() {
  const missing = [];
  if (!firebaseConfig.apiKey) missing.push("NEXT_PUBLIC_FIREBASE_API_KEY");
  if (!firebaseConfig.authDomain) missing.push("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
  if (!firebaseConfig.projectId) missing.push("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  if (!firebaseConfig.storageBucket) missing.push("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET");
  if (!firebaseConfig.messagingSenderId) missing.push("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID");
  if (!firebaseConfig.appId) missing.push("NEXT_PUBLIC_FIREBASE_APP_ID");
  if (missing.length) {
    console.warn(
      "[firebaseClient] Variáveis Firebase faltando:",
      missing.join(", "),
      "→ Configure no .env.local e na Vercel (Environment Variables)."
    );
  }
}
warnMissingConfig();

// ✅ inicializa uma vez só
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// exports padrão
export const auth = getAuth(app);
export const db = getFirestore(app);

// ===== Push helpers =====
/**
 * Ativa push (pede permissão) + gera FCM token + salva no backend
 * Retorna o token (string) ou null.
 */
export async function enablePushAndSaveToken() {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;
  if (!("Notification" in window)) return null;

  const supported = await isSupported().catch(() => false);
  if (!supported) return null;

  const user = auth.currentUser;
  if (!user) {
    console.warn("enablePushAndSaveToken: usuário não logado");
    return null;
  }

  const VAPID_KEY =
    process.env.NEXT_PUBLIC_VAPID_KEY ||
    process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ||
    "";

  if (!VAPID_KEY) {
    console.warn("Faltou NEXT_PUBLIC_VAPID_KEY (ou NEXT_PUBLIC_FIREBASE_VAPID_KEY)");
    return null;
  }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return null;

  // registra SW do FCM
  const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  await navigator.serviceWorker.ready;

  const messaging = getMessaging(app);

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: reg,
  });

  if (!token) return null;

  // envia pro backend com Bearer token (seu backend exige)
  const idToken = await user.getIdToken();
  const res = await fetch("/api/push/saveToken", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ token, device: "web" }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("Falha ao salvar token:", res.status, t);
    return null;
  }

  // foreground (quando app aberto)
  onMessage(messaging, (payload) => {
    console.log("Push foreground:", payload);
  });

  return token;
}
