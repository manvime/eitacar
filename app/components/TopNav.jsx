"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import "@/lib/firebaseClient"; // garante que o firebase client foi inicializado

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();

  const [authReady, setAuthReady] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "").toLowerCase();

  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, (u) => {
      setUserEmail((u?.email || "").toLowerCase());
      setAuthReady(true);
    });
  }, []);

  const isLogged = useMemo(() => !!userEmail, [userEmail]);
  const isAdmin = useMemo(() => !!adminEmail && userEmail === adminEmail, [adminEmail, userEmail]);

  const isActive = (href) => pathname === href;

  const btnStyle = (active) => ({
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)",
    background: active ? "rgba(255,255,255,0.12)" : "transparent",
    color: "white",
    textDecoration: "none",
    fontWeight: 700,
    fontSize: 15,
  });

  async function handleLogout() {
    try {
      await signOut(getAuth());
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  // "Sair do site": navegador normalmente NÃO deixa fechar aba/janela se não foi aberta via script.
  // Então o "Sair" aqui é o logout + ir para /login (mais seguro e esperado).
  // Se você quiser “sair do site” mesmo, pode trocar por: window.location.href = "about:blank";
  const showRightButton = authReady && isLogged; // só mostra botão à direita quando estiver logado

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 50, background: "#000" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 900, color: "white", marginRight: 10, fontSize: 18 }}>
          eitaCar
        </div>

        {/* Login sempre visível */}
        <Link href="/login" style={btnStyle(isActive("/login"))}>
          Login
        </Link>

        {/* Só aparece depois que estiver logado */}
        {authReady && isLogged && (
          <>
            <Link href="/perfil" style={btnStyle(isActive("/perfil"))}>
              Perfil
            </Link>
            <Link href="/buscar" style={btnStyle(isActive("/buscar"))}>
              Buscar
            </Link>
            <Link href="/chats" style={btnStyle(isActive("/chats"))}>
              Chats
            </Link>

            {/* Admin só aparece pro email admin */}
            {isAdmin && (
              <Link href="/admin" style={btnStyle(isActive("/admin"))}>
                Admin
              </Link>
            )}
          </>
        )}

        <div style={{ flex: 1 }} />

        {/* Em vez de Voltar: Sair (somente logado) */}
        {showRightButton && (
          <button
            onClick={handleLogout}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              fontWeight: 800,
              cursor: "pointer",
              fontSize: 15,
            }}
          >
            Sair
          </button>
        )}
      </div>

      <div style={{ height: 1, background: "rgba(255,255,255,0.12)" }} />
    </div>
  );
}

