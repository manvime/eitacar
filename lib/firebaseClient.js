import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { getAuth } from "firebase/auth";

export async function enablePushAndSaveToken() {
  if (typeof window === "undefined") return;

  if (!("serviceWorker" in navigator)) return;
  if (!("Notification" in window)) return;

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return;

  const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

  const messaging = getMessaging();
  const token = await getToken(messaging, {
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: reg,
  });

  if (!token) return;

  // envia pro seu backend salvar no Firestore
  await fetch("/api/push/saveToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  // Foreground (quando app aberto)
  onMessage(messaging, (payload) => {
    // aqui você pode mostrar um toast dentro do site
    console.log("Push foreground:", payload);
  });

  return token;
}
