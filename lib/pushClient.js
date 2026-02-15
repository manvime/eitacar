"use client";

import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { auth } from "@/lib/firebaseClient"; // já inicializa o app do client

function getFirebaseApp() {
  // garante app inicializado (mesmo config do firebaseClient.js)
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

export async function initWebPush() {
  // iOS/Safari pode não suportar (ou só via PWA instalado). Sem suporte, só ignora.
  const supported = await isSupported().catch(() => false);
  if (!supported) return { ok: false, reason: "not_supported" };

  if (typeof window === "undefined") return { ok: false, reason: "no_window" };

  // precisa estar logado
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: "not_logged" };

  // pede permissão
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "permission_denied" };

  // registra SW (arquivo abaixo)
  const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

  const vapidKey =
    process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ||
    process.env.NEXT_PUBLIC_VAPID_KEY ||
    "";

  if (!vapidKey) {
    return { ok: false, reason: "missing_vapid_key" };
  }

  const app = getFirebaseApp();
  const messaging = getMessaging(app);

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: reg,
  });

  if (!token) return { ok: false, reason: "no_token" };

  const idToken = await user.getIdToken(true);

  await fetch("/api/push/saveToken", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      token,
      device: navigator.userAgent.includes("Android") ? "android-web" : "web",
    }),
  });

  // mensagens em foreground (quando o app está aberto)
  onMessage(messaging, (payload) => {
    // aqui você pode abrir um toast / badge / etc
    // exemplo simples:
    const title = payload?.notification?.title || "Nova mensagem";
    const body = payload?.notification?.body || "";
    console.log("Push (foreground):", payload);
    // não use alert sempre, mas pra teste funciona:
    // alert(`${title}\n\n${body}`);
  });

  return { ok: true, token };
}
