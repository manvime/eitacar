"use client";

import { useEffect, useMemo, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import "@/lib/firebaseClient";

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_KEY || "";

// chave local pra lembrar se o usuário quer notificações
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

  const permission = useMemo(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission; // 'default' | 'granted' | 'denied'
  }, [status]); // status força reavaliação após ações

  // carrega opt-in salvo + user auth
  useEffect(() => {
    if (typeof window !== "undefined") {
      setOptIn(localStorage.getItem(LS_OPTIN) === "1");
    }
    const auth = getAuth();
    return onAuthStateChanged(auth, (u) => setUser(u || null));
  }, []);

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
        setStatus("Notificações bloqueadas no navegador. Libere nas permissões do site.");
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
        setStatus("Falha ao registrar SW. Confira se /firebase-messaging-sw.js abre (200).");
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

      // marca opt-in e salva token local pra facilitar desativar
      localStorage.setItem(LS_OPTIN, "1");
      localStorage.setItem(LS_TOKEN, token);
      setOptIn(true);
      setStatus("Notificações ativadas ✅");
    } catch (e) {
      console.error(e);
      setStatus("Erro ao ativar notificações (veja o console).");
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

      // remove token do banco (para parar de receber)
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
      setStatus("Erro ao desativar (mas opt-out foi aplicado).");
    } finally {
      setBusy(false);
    }
  }

  // UI do box
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
            Receba alertas quando chegar uma nova mensagem no sistema.
          </div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
            Permissão do navegador:{" "}
            <b>
              {permission === "unsupported"
                ? "não suportado"
                : permission === "granted"
                ? "permitido"
                : permission === "denied"
                ? "bloqueado"
                : "ainda não escolhido"}
            </b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
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
      </div>

      {status ? <div style={{ marginTop: 10, fontSize: 13, opacity: 0.9 }}>{status}</div> : null}
    </div>
  );
}
