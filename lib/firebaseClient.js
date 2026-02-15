import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { getAuth } from "firebase/auth";

/**
 * Ativa push (pede permissão) + gera FCM token + salva no backend
 * Retorna o token (string) ou null.
 */
export async function enablePushAndSaveToken() {
  if (typeof window === "undefined") return null;

  if (!("serviceWorker" in navigator)) return null;
  if (!("Notification" in window)) return null;

  // Em alguns browsers/ambientes o Messaging não é suportado
  const supported = await isSupported().catch(() => false);
  if (!supported) return null;

  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) {
    console.warn("enablePushAndSaveToken: usuário não logado");
    return null;
  }

  const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_KEY || process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || "";
  if (!VAPID_KEY) {
    console.warn("Faltou NEXT_PUBLIC_VAPID_KEY (ou NEXT_PUBLIC_FIREBASE_VAPID_KEY)");
    return null;
  }

  // Só pede permissão quando usuário chama essa função (botão)
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return null;

  // Registra (ou garante) o SW
  const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  await navigator.serviceWorker.ready;

  const messaging = getMessaging();

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: reg,
  });

  if (!token) return null;

  // ✅ IMPORTANTE: enviar Bearer token (seu backend exige)
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

  // Foreground (quando app aberto)
  onMessage(messaging, (payload) => {
    console.log("Push foreground:", payload);
  });

  return token;
}
