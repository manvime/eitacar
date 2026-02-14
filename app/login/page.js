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
  const [msg, setMsg] = useState("");

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u || null);
      setMsg("");
      if (u) {
        try {
          await apiPost("/api/upsertUserProfile", {});
        } catch (e) {}
      }
    });
  }, []);

  async function handleRegister() {
    setMsg("");
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await sendEmailVerification(cred.user);
    setMsg("Conta criada! Verifique seu email e depois faça login.");
    await signOut(auth);
  }

  async function handleLogin() {
    setMsg("");
    await signInWithEmailAndPassword(auth, email, pass);
    try {
      await apiPost("/api/upsertUserProfile", {});
      setMsg("Logado ✅");
    } catch (e) {
      setMsg(e.message);
    }
  }

  async function resendVerification() {
    if (!auth.currentUser) return;
    await sendEmailVerification(auth.currentUser);
    setMsg("Email de verificação reenviado.");
  }

  async function resetPass() {
    await sendPasswordResetEmail(auth, email);
    setMsg("Email de reset enviado (se existir conta).");
  }

  async function logout() {
    await signOut(auth);
    setMsg("Saiu.");
  }

  return (
    <div style={{ maxWidth: 420, fontFamily: "Arial, sans-serif" }}>
      <h2>Login / Cadastro</h2>

      <label>Email</label>
      <input style={inp} value={email} onChange={(e) => setEmail(e.target.value)} />

      <label>Senha</label>
      <input style={inp} type="password" value={pass} onChange={(e) => setPass(e.target.value)} />

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button onClick={handleLogin}>Entrar</button>
        <button onClick={handleRegister}>Cadastrar</button>
        <button onClick={resetPass}>Esqueci senha</button>
      </div>

      {user && (
        <div style={{ marginTop: 12 }}>
          <div><b>Usuário:</b> {user.email}</div>
          <div><b>Email verificado:</b> {String(user.emailVerified)}</div>
          {!user.emailVerified && (
            <button style={{ marginTop: 8 }} onClick={resendVerification}>
              Reenviar verificação
            </button>
          )}
          <button style={{ marginTop: 8 }} onClick={logout}>Sair</button>
        </div>
      )}

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
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
