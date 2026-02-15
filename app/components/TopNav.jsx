"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import "@/lib/firebaseClient"; // garante que o firebase client foi inicializado

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();

  const [userEmail, setUserEmail] = useState("");
  const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "").toLowerCase();

  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, (u) => {
      setUserEmail((u?.email || "").toLowerCase());
    });
  }, []);

  const isLogged = useMemo(() => !!userEmail, [userEmail]);

  const isActive = (href) => pathname === href;

  const btnStyle = (active) => ({
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)",
    background: active ? "rgba(255,255,255,0.12)" : "transparent",
    color: "white",
    textDecoration: "none",
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  });

  const btnGhost = {
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "transparent",
    color: "white",
    fontWeight: 600,
    cursor: "pointer",
  };

  async function handleLogout() {
    try {
      const auth = getAuth();
      await signOut(auth);
      router.push("/"); // volta pra home
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 50, background: "#000" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12 }}>
        {/* Marca */}
        <Link
          href="/"
          style={{
            fontWeight: 800,
            color: "white",
            marginRight: 10,
            textDecoration: "none",
            letterSpacing: 0.2,
          }}
        >
          eitaCar
        </Link>

        {/* Sempre aparece */}
        <Link href="/login" style={btnStyle(isActive("/login"))}>
          Login
        </Link>

        {/* Só aparece quando estiver logado */}
        {isLogged && (
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
            {adminEmail && userEmail === adminEmail && (
              <Link href="/admin" style={btnStyle(isActive("/admin"))}>
                Admin
              </Link>
            )}
          </>
        )}

        <div style={{ flex: 1 }} />

        {/* Direita */}
        {isLogged ? (
          <button onClick={handleLogout} style={btnGhost}>
            Sair
          </button>
        ) : (
          <button onClick={() => router.back()} style={btnGhost}>
            Voltar
          </button>
        )}
      </div>

      <div style={{ height: 1, background: "rgba(255,255,255,0.12)" }} />
    </div>
  );
}


