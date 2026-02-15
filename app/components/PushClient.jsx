"use client";

import { useEffect, useRef, useState } from "react";
import "@/lib/firebaseClient"; // garante que firebaseClient inicialize
import { getAuth, onAuthStateChanged } from "firebase/auth";

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_KEY || "";

// registra/pega service worker
async function ensureServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;

  try {
    const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    await navigator.serviceWorker.ready;
    return reg;
  } catch (err) {
    console.error("Service Worker register error:", err);
    return null;
  }
}

export default function PushClient() {
  const [status, setStatus] = useState("");
  const startedRef = useRef(false);

  useEffect(() => {
    const auth = getAuth();

    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          setStatus("");
          startedRef.current = false;
          return;
        }

        // evita rodar 2x em re-render
        if (startedRef.current) return;
        startedRef.current = true;

        if (!("Notification" in window)) {
          setStatus("Navegador não suporta notificações.");
          return;
        }

        if (Notification.permission === "denied") {
          setStatus("Notificações bloqueadas no navegador (perm. DENIED).");
          return;
        }

        // pedir permissão
        if (Notification.permission !== "granted") {
          const perm = await Notification.requestPermission();
          if (perm !== "granted") {
            setStatus("Notificações não permitidas.");
            return;
          }
        }

        // garantir SW
        const swReg = await ensureServiceWorker();
        if (!swReg) {
          setStatus("Falha ao registrar SW. Verifique /firebase-messaging-sw.js (404?).");
          return;
        }

        if (!VAPID_KEY) {
          setStatus("Faltou NEXT_PUBLIC_VAPID_KEY no .env.local");
          return;
        }

        // firebase messaging
        const { getMessaging, getToken, onMessage } = await import("firebase/messaging");
        const messaging = getMessaging();

        // pega token FCM
        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        });

        if (!token) {
          setStatus("Não consegui gerar token de push (getToken retornou vazio).");
          return;
        }

        // salva token no backend
        const idToken = await user.getIdToken();

        const resp = await fetch("/api/push/saveToken", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            token,
            device: "web",
          }),
        });

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          setStatus(data?.error || "Erro salvando token.");
          return;
        }

        setStatus("Notificações ativadas ✅");

        // foreground: quando o app está aberto
        onMessage(messaging, (payload) => {
          try {
            const title = payload?.notification?.title || "Nova mensagem";
            const body = payload?.notification?.body || "";
            const threadId = payload?.data?.threadId;

            // mostra notificação mesmo em foreground (opcional)
            if (Notification.permission === "granted") {
              const n = new Notification(title, {
                body,
                icon: "/icons/icon-192.png",
                data: { threadId },
              });

              n.onclick = () => {
                const url = threadId ? `/t/${threadId}` : `/chats`;
                window.focus();
                window.location.href = url;
              };
            }
          } catch (e) {
            console.error("onMessage error:", e);
          }
        });
      } catch (e) {
        console.error(e);
        setStatus("Erro ativando notificações (veja console).");
      }
    });

    return () => unsub();
  }, []);

  return status ? (
    <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>{status}</div>
  ) : null;
}
