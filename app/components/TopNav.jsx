"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import "@/lib/firebaseClient"; // garante que o firebase client foi inicializado

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();

  const [userEmail, setUserEmail] = useState("");
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "").toLowerCase().trim();

  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, (u) => {
      setUserEmail((u?.email || "").toLowerCase());
      setLoadingAuth(false);
    });
  }, []);

  const isLoggedIn = !!userEmail && !loadingAuth;

  const isActive = (href) => pathname === href;

  const btnStyle = (active) => ({
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)",
    background: active ? "rgba(255,255,255,0.12)" : "transparent",
    color: "white",
    textDecoration: "none",
    fontWeight: 600,
    cursor: "pointer",
  });

  async function handleLogout() {
    try {
      setSigningOut(true);
      const auth = getAuth();
      await signOut(auth);
      router.push("/login");
      router.refresh();
    } catch (e) {
      console.error("logout failed:", e);
      alert("Erro ao sair. Tente novamente.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 50, background: "#000" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12 }}>
        {/* ✅ olaCar -> eitaCar */}
        <div style={{ fontWeight: 800, color: "white", marginRight: 10 }}>eitaCar</div>

        {/* ✅ Login sempre aparece */}
        <Link href="/login" style={btnStyle(isActive("/login"))}>
          Login
        </Link>

        {/* ✅ Buscar e Chats só depois do login */}
        {isLoggedIn && (
          <>
            <Link href="/buscar" style={btnStyle(isActive("/buscar"))}>
              Buscar
            </Link>

            <Link href="/chats" style={btnStyle(isActive("/chats"))}>
              Chats
            </Link>

            {/* ✅ Admin só aparece pro seu email e só logado */}
            {adminEmail && userEmail === adminEmail && (
              <Link href="/admin" style={btnStyle(isActive("/admin"))}>
                Admin
              </Link>
            )}
          </>
        )}

        <div style={{ flex: 1 }} />

        {/* ✅ Botão Sair (só logado) */}
        {isLoggedIn && (
          <button onClick={handleLogout} disabled={signingOut} style={btnStyle(false)}>
            {signingOut ? "Saindo..." : "Sair"}
          </button>
        )}

        {/* Mantive o Voltar como você tinha */}
        <button
          onClick={() => router.back()}
          style={btnStyle(false)}
        >
          Voltar
        </button>
      </div>

      <div style={{ height: 1, background: "rgba(255,255,255,0.12)" }} />
    </div>
  );
}

