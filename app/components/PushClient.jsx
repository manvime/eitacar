"use client";

import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import "@/lib/firebaseClient";

const VAPID_KEY =
  "BCeYvN58J-OAWWp2fBjXQOkdRT6f2mEjQ0VET8-IrgOPPORZwgXl_lNiBP6vBvg6AGF0RGgrbiB8BTtUbeFaL5c";

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  return reg;
}

export default function PushClient() {
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return; // só roda logado

        if (!("Notification" in window)) {
          setStatus("Navegador não suporta notificações.");
          return;
        }

        // Se já negou, não adianta insistir
        if (Notification.permission === "denied") {
          setStatus("Notificações bloqueadas no navegador.");
          return;
        }

        // Pede permissão (se ainda não deu)
        if (Notification.permission !== "granted") {
          const perm = await Notification.requestPermission();
          if (perm !== "granted") {
            setStatus("Notificações não permitidas.");
            return;
          }
        }

        const reg = await registerServiceWorker();
        if (!reg) {
          setStatus("Service Worker não disponível.");
          return;
        }

        // Importa só no client
        const { getMessaging, getToken } = await import("firebase/messaging");

        const messaging = getMessaging();
        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: reg,
        });

        if (!token) {
          setStatus("Não foi possível gerar token de push.");
          return;
        }

        const idToken = await user.getIdToken();

        const resp = await fetch("/api/push/saveToken", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            token,
            platform: "web",
            userAgent: navigator.userAgent,
          }),
        });

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          setStatus(data?.error || "Erro salvando token.");
          return;
        }

        if (!cancelled) setStatus("Notificações ativadas ✅");
      } catch (e) {
        if (!cancelled) setStatus("Erro ativando notificações.");
        console.error(e);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Se você não quiser mostrar nada na UI, pode retornar null.
  return status ? (
    <div style={{ marginTop: 12, opacity: 0.85, fontSize: 14 }}>{status}</div>
  ) : null;
}
