// lib/firebaseClient.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

import {
  getMessaging,
  getToken,
  deleteToken,
  isSupported,
  onMessage,
} from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// ----- helpers -----
function getVapidKey() {
  return (
    process.env.NEXT_PUBLIC_VAPID_KEY ||
    process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ||
    ""
  );
}

export async function pushIsSupported() {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!("Notification" in window)) return false;
  return await isSupported().catch(() => false);
}

export function getNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
}

// Ativa push: pede permissão, registra SW, pega token, salva no backend
export async function enablePushAndSaveToken() {
  const supported = await pushIsSupported();
  if (!supported) throw new Error("Push não suportado neste navegador.");

  const user = auth.currentUser;
  if (!user) throw new Error("Você precisa estar logado para ativar notificações.");

  const vapidKey = getVapidKey();
  if (!vapidKey) throw new Error("Faltou configurar a VAPID KEY (NEXT_PUBLIC_FIREBASE_VAPID_KEY).");

  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Permissão de notificação não concedida.");

  // registra o service worker do FCM (arquivo em /public/firebase-messaging-sw.js)
  const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  await navigator.serviceWorker.ready;

  const messaging = getMessaging(app);

  const fcmToken = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: reg,
  });

  if (!fcmToken) throw new Error("Não consegui gerar o token do FCM.");

  // salva token no backend
  const idToken = await user.getIdToken(true);
  const res = await fetch("/api/push/saveToken", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ token: fcmToken, platform: "web" }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Falha ao salvar token no servidor: ${res.status} ${t}`);
  }

  // opcional: ouvir push em foreground (app aberto)
  onMessage(messaging, (payload) => {
    console.log("FCM foreground:", payload);
  });

  // guarda localmente pra desativar depois
  localStorage.setItem("fcmToken", fcmToken);

  return fcmToken;
}

// Desativa push: remove token do FCM + avisa backend + opcional unregister SW
export async function disablePushAndDeleteToken({ unregisterServiceWorker = false } = {}) {
  const supported = await pushIsSupported();
  if (!supported) return true;

  const user = auth.currentUser;
  if (!user) throw new Error("Você precisa estar logado.");

  const messaging = getMessaging(app);

  // tenta pegar token salvo (mais confiável)
  const saved = localStorage.getItem("fcmToken") || "";

  // remove do FCM (revoga do browser)
  // deleteToken remove o token atual associado ao SW/config
  await deleteToken(messaging).catch(() => {});

  // avisa backend para remover registro
  if (saved) {
    const idToken = await user.getIdToken(true);
    await fetch("/api/push/deleteToken", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ token: saved }),
    }).catch(() => {});
  }

  localStorage.removeItem("fcmToken");

  // opcional: desregistrar SW (não é obrigatório)
  if (unregisterServiceWorker) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
  }

  return true;
}
