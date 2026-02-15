"use client";

import { useEffect, useMemo, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import "@/lib/firebaseClient";

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_KEY || "";

// lembrar escolha do usuário
const LS_OPTIN = "push_opt_in";
const LS_TOKEN = "push_fcm_token";

async function ensureServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    await navigator.serviceWorker.ready;
    return reg;
  } catch (e) {
    console.error("SW register error:", e);
    return null;
  }
}

export default function PushClient() {
  const [user, setUser] = useState(null);
  const [optIn, setOptIn] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOptIn(localStorage.getItem(LS_OPTIN) === "1");
    }
    const auth = getAuth();
    return onAuthStateChanged(auth, (u) => setUser(u || null));
  }, []);

  const permissionLabel = useMemo(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "não suportado";
    if (Notification.permission === "granted") return "permitido";
    if (Notification.permission === "denied") return "bloqueado";
    return "ainda não escolhido";
  }, [status]);

  async function enablePush() {
    try {
      setBusy(true);
      setStatus("");

      if (!user) {
        setStatus("Faça login para ativar.");
        return;
      }

      if (!VAPID_KEY) {
        setStatus("Faltou NEXT_PUBLIC_VAPID_KEY no .env.local");
        return;
      }

      if (!("Notification" in window)) {
        setStatus("Seu navegador não suporta notificações.");
        return;
      }

      if (Notification.permission === "denied") {
        setStatus("Notificações bloqueadas. Libere nas permissões do site.");
        return;
      }

      // pede permissão só no clique
      if (Notification.permission !== "granted") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setStatus("Permissão não concedida.");
          return;
        }
      }

      const swReg = await ensureServiceWorker();
      if (!swReg) {
        setStatus("Falha no Service Worker. Verifique /firebase-messaging-sw.js (200).");
        return;
      }

      const { getMessaging, getToken } = await import("firebase/messaging");
      const messaging = getMessaging();

      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swReg,
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
        body: JSON.stringify({ token, device: "web" }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setStatus(data?.error || "Erro salvando token.");
        return;
      }

      localStorage.setItem(LS_OPTIN, "1");
      localStorage.setItem(LS_TOKEN, token);
      setOptIn(true);
      setStatus("Notificações ativadas ✅");
    } catch (e) {
      console.error(e);
      setStatus("Erro ao ativar (veja o console).");
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    try {
      setBusy(true);
      setStatus("");

      localStorage.setItem(LS_OPTIN, "0");
      setOptIn(false);

      const token = localStorage.getItem(LS_TOKEN) || "";
      localStorage.removeItem(LS_TOKEN);

      if (!user || !token) {
        setStatus("Notificações desativadas.");
        return;
      }

      const idToken = await user.getIdToken();
      await fetch("/api/push/saveToken", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ token }),
      }).catch(() => {});

      setStatus("Notificações desativadas.");
    } catch (e) {
      console.error(e);
      setStatus("Erro ao desativar (mas já desligou).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        marginTop: 10,
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 12,
        padding: 12,
        color: "white",
        background: "rgba(255,255,255,0.04)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>Notificações</div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>
            Ative para receber alertas quando chegar mensagem.
          </div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
            Permissão do navegador: <b>{permissionLabel}</b>
          </div>
        </div>

        {!optIn ? (
          <button
            onClick={enablePush}
            disabled={busy}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.12)",
              color: "white",
              cursor: busy ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            {busy ? "Ativando..." : "Ativar"}
          </button>
        ) : (
          <button
            onClick={disablePush}
            disabled={busy}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "transparent",
              color: "white",
              cursor: busy ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            {busy ? "Desativando..." : "Desativar"}
          </button>
        )}
      </div>

      {status ? <div style={{ marginTop: 10, fontSize: 13, opacity: 0.9 }}>{status}</div> : null}
    </div>
  );
}
