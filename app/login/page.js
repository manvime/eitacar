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

const NOTICE_KEY = "login_notice_v1";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [user, setUser] = useState(null);
  const [msg, setMsg] = useState("");

  // ✅ carrega mensagem persistida (ex.: "email enviado")
  useEffect(() => {
    const saved = localStorage.getItem(NOTICE_KEY);
    if (saved) setMsg(saved);
  }, []);

  function setPersistentMsg(text) {
    setMsg(text);
    localStorage.setItem(NOTICE_KEY, text);
  }

  function clearMsg() {
    setMsg("");
    localStorage.removeItem(NOTICE_KEY);
  }

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u || null);

      // Se logou, limpa aviso persistido para não ficar “grudado”
      if (u) {
        clearMsg();
        try {
          await apiPost("/api/upsertUserProfile", {});
        } catch (e) {
          console.error("upsertUserProfile failed:", e);
        }
      }
    });
  }, []);

  async function handleRegister() {
    try {
      clearMsg();

      if (!email) return setMsg("Digite seu email.");
      if (!pass) return setMsg("Digite sua senha.");

      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await sendEmailVerification(cred.user);

      // ✅ mantém aparecendo mesmo após refresh
      setPersistentMsg(
        "Email de verificação enviado! Verifique sua caixa de entrada (e spam). Depois faça login."
      );

      // desloga para forçar verificação antes de usar
      await signOut(auth);
    } catch (e) {
      const code = e?.code || "";
      if (code === "auth/email-already-in-use") {
        setMsg("Email já cadastrado.");
      } else if (code === "auth/invalid-email") {
        setMsg("Email inválido.");
      } else if (code === "auth/weak-password") {
        setMsg("Senha fraca. Use pelo menos 6 caracteres.");
      } else {
        setMsg("Erro ao cadastrar. " + (e?.message || ""));
      }
    }
  }

  async function handleLogin() {
    try {
      clearMsg();

      if (!email) return setMsg("Digite seu email.");
      if (!pass) return setMsg("Digite sua senha.");

      await signInWithEmailAndPassword(auth, email, pass);

      // tenta atualizar perfil, mas não trava login
      try {
        await apiPost("/api/upsertUserProfile", {});
      } catch (e) {
        console.error("upsertUserProfile failed:", e);
      }

      window.location.href = "/buscar";
    } catch (e) {
      const code = e?.code || "";
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setMsg("Senha incorreta.");
      } else if (code === "auth/user-not-found") {
        setMsg("Usuário não encontrado.");
      } else if (code === "auth/invalid-email") {
        setMsg("Email inválido.");
      } else {
        setMsg("Erro ao entrar. " + (e?.message || ""));
      }
    }
  }

  async function resendVerification() {
    try {
      if (!auth.currentUser) return;
      await sendEmailVerification(auth.currentUser);
      setMsg("Email de verificação reenviado.");
    } catch (e) {
      setMsg("Não foi possível reenviar. " + (e?.message || ""));
    }
  }

  async function resetPass() {
    try {
      clearMsg();
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
    await signOut(auth);
    setMsg("Saiu.");
  }

  return (
    <div style={{ maxWidth: 520, fontFamily: "Arial, sans-serif" }}>
      <h2>Login / Cadastro</h2>

      <label>Email</label>
      <input style={inp} value={email} onChange={(e) => setEmail(e.target.value)} />

      <label>Senha</label>
      <input style={inp} type="password" value={pass} onChange={(e) => setPass(e.target.value)} />

      {/* ✅ 3 botões lado a lado */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: 10,
          marginTop: 12,
          flexWrap: "wrap",
        }}
      >
        <button style={{ ...btn, flex: 1, textAlign: "center" }} onClick={handleLogin}>
          Entrar
        </button>

        <button style={{ ...btnOutline, flex: 1, textAlign: "center" }} onClick={handleRegister}>
          Cadastrar
        </button>

        <button style={{ ...btnOutline, flex: 1, textAlign: "center" }} onClick={resetPass}>
          Esqueci senha
        </button>
      </div>

      {user && (
        <div style={{ marginTop: 12 }}>
          <div>
            <b>Usuário:</b> {user.email}
          </div>
          <div>
            <b>Email verificado:</b> {String(user.emailVerified)}
          </div>

          {!user.emailVerified && (
            <button style={{ ...btnOutline, marginTop: 10 }} onClick={resendVerification}>
              Reenviar verificação
            </button>
          )}

          <button style={{ ...btnOutline, marginTop: 10 }} onClick={logout}>
            Sair
          </button>
        </div>
      )}

      {msg && (
        <p
          style={{
            marginTop: 12,
            padding: 10,
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 10,
          }}
        >
          {msg}
        </p>
      )}
    </div>
  );
}

const inp = {
  width: "100%",
  padding: 10,
  border: "1px solid #ccc",
  borderRadius: 6,
  marginTop: 6,
  marginBottom: 10,
};

const btn = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.10)",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

const btnOutline = {
  ...btn,
  background: "transparent",
};
