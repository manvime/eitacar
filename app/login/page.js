"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebaseClient";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { apiPost } from "@/lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

  const [user, setUser] = useState(null);

  // popup geral (com OK)
  const [msg, setMsg] = useState("");

  // bloco de verificação
  const [needsVerify, setNeedsVerify] = useState(false);
  const [sendingVerify, setSendingVerify] = useState(false);
  const [verifyInfo, setVerifyInfo] = useState("");

  // qual botão foi clicado por último
  const [activeBtn, setActiveBtn] = useState(null); // "login" | "register" | "reset" | null

  // ✅ mostrar "Entrando..."
  const [isEntering, setIsEntering] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u || null);

      // se entrou, mas está verificando ou não
      if (u) {
        setNeedsVerify(!u.emailVerified);
      } else {
        setNeedsVerify(false);
      }
    });
  }, []);

  async function handleRegister() {
    try {
      setVerifyInfo("");
      setIsEntering(false);

      if (!email) return setMsg("Digite seu email.");
      if (!pass) return setMsg("Digite sua senha.");

      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await sendEmailVerification(cred.user);

      setMsg(
        "Conta criada! Enviamos um email de verificação. Verifique sua caixa de entrada (e spam). Depois faça login."
      );

      await signOut(auth);
    } catch (e) {
      const code = e?.code || "";
      if (code === "auth/email-already-in-use") setMsg("Email já cadastrado.");
      else if (code === "auth/invalid-email") setMsg("Email inválido.");
      else if (code === "auth/weak-password")
        setMsg("Senha fraca. Use pelo menos 6 caracteres.");
      else setMsg("Erro ao cadastrar. " + (e?.message || ""));
    }
  }

  async function handleLogin() {
    try {
      setVerifyInfo("");
      setIsEntering(true);

      if (!email) {
        setIsEntering(false);
        return setMsg("Digite seu email.");
      }
      if (!pass) {
        setIsEntering(false);
        return setMsg("Digite sua senha.");
      }

      const cred = await signInWithEmailAndPassword(auth, email, pass);
      await cred.user.reload();

      if (!cred.user.emailVerified) {
        setNeedsVerify(true);
        setIsEntering(false);
        return;
      }

      try {
        await apiPost("/api/upsertUserProfile", {});
      } catch (e) {}

      // mantém "Entrando..." até sair da página
      window.location.href = "/buscar";
    } catch (e) {
      setIsEntering(false);

      const code = e?.code || "";
      if (code === "auth/wrong-password" || code === "auth/invalid-credential")
        setMsg("Senha incorreta.");
      else if (code === "auth/user-not-found") setMsg("Usuário não encontrado.");
      else if (code === "auth/invalid-email") setMsg("Email inválido.");
      else setMsg("Erro ao entrar. " + (e?.message || ""));
    }
  }

  async function resendVerification() {
    try {
      setVerifyInfo("");
      setIsEntering(false);

      if (!auth.currentUser) {
        setVerifyInfo("Faça login primeiro.");
        return;
      }

      setSendingVerify(true);
      await sendEmailVerification(auth.currentUser);

      setVerifyInfo("Link reenviado! Verifique sua caixa de entrada (e spam).");
    } catch (e) {
      setVerifyInfo("Não foi possível reenviar. " + (e?.message || ""));
    } finally {
      setSendingVerify(false);
    }
  }

  async function resetPass() {
    try {
      setVerifyInfo("");
      setIsEntering(false);

      if (!email) return setMsg("Digite seu email primeiro.");
      await sendPasswordResetEmail(auth, email);

      setMsg("Email de redefinição enviado (se existir conta).");
    } catch (e) {
      const code = e?.code || "";
      if (code === "auth/user-not-found") setMsg("Email não cadastrado.");
      else if (code === "auth/invalid-email") setMsg("Email inválido.");
      else setMsg("Erro ao enviar email. " + (e?.message || ""));
    }
  }

  async function logout() {
    setIsEntering(false);
    setVerifyInfo("");
    setNeedsVerify(false);
    await signOut(auth);
    setMsg("Saiu.");
  }

  return (
    <div style={{ maxWidth: 720, fontFamily: "Arial, sans-serif" }}>
      <h2>Login</h2>

      <label>Email</label>
      <input style={inp} value={email} onChange={(e) => setEmail(e.target.value)} />

      <label>Senha</label>
      <input
        style={inp}
        type="password"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
      />

      {/* Botões lado a lado + highlight suave */}
      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <button
          disabled={isEntering}
          style={btnAction(activeBtn === "login")}
          onClick={() => {
            setActiveBtn("login");
            handleLogin();
          }}
        >
          Entrar
        </button>

        <button
          disabled={isEntering}
          style={btnAction(activeBtn === "register")}
          onClick={() => {
            setActiveBtn("register");
            handleRegister();
          }}
        >
          Cadastrar
        </button>

        <button
          disabled={isEntering}
          style={btnAction(activeBtn === "reset")}
          onClick={() => {
            setActiveBtn("reset");
            resetPass();
          }}
        >
          Esqueci senha
        </button>
      </div>

      {/* ✅ Entrando... (quando login OK) */}
      {isEntering && !needsVerify && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 10,
          }}
        >
          Entrando...
        </div>
      )}

      {/* Bloco verificação */}
      {needsVerify && (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              padding: 12,
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 10,
              marginBottom: 10,
            }}
          >
            <div style={{ fontWeight: 800 }}>Falta verificar seu email.</div>
            <div style={{ marginTop: 6, opacity: 0.9 }}>
              Abra seu email e clique no link de verificação.
            </div>

            {verifyInfo && <div style={{ marginTop: 10, opacity: 0.9 }}>{verifyInfo}</div>}
          </div>

          <button
            style={{ ...btnOutline, width: "100%", textAlign: "center" }}
            onClick={resendVerification}
            disabled={sendingVerify}
          >
            {sendingVerify ? "Enviando..." : "Reenviar link de verificação"}
          </button>

          <button
            style={{ ...btnOutline, width: "100%", marginTop: 10, textAlign: "center" }}
            onClick={logout}
          >
            Sair
          </button>
        </div>
      )}

      {/* Popup com OK (não aparece quando needsVerify=true) */}
      {msg && !needsVerify && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 560,
              background: "#0b0b0b",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 14,
              padding: 16,
              color: "white",
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Aviso</div>

            <div
              style={{
                padding: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                lineHeight: 1.35,
              }}
            >
              {msg}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <button
                type="button"
                onClick={() => {
                  setMsg("");
                  setActiveBtn(null);
                }}
                style={{
                  padding: "10px 16px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(255,255,255,0.10)",
                  color: "white",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inp = {
  width: "100%",
  padding: 10,
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 8,
  marginTop: 6,
  marginBottom: 10,
  background: "transparent",
  color: "white",
};

const btnBase = {
  flex: 1,
  minWidth: 150,
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.10)", // cor padrão (igual ao Entrar)
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
  textAlign: "center",
  transition: "all 180ms ease",
  opacity: 1,
};

const btnAction = (active) => ({
  ...btnBase,
  background: active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)",
  border: active ? "1px solid rgba(255,255,255,0.28)" : "1px solid rgba(255,255,255,0.15)",
  boxShadow: active ? "0 0 0 3px rgba(255,255,255,0.06)" : "none",
});

const btnOutline = {
  ...btnBase,
  background: "transparent",
};
