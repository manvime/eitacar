"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import "@/lib/firebaseClient"; // garante que o firebase client foi inicializado

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();

  const [userEmail, setUserEmail] = useState("");
  const isLogged = useMemo(() => !!userEmail, [userEmail]);

  const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "").toLowerCase();

  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, (u) => {
      setUserEmail((u?.email || "").toLowerCase());
    });
  }, []);

  const isActive = (href) => pathname === href;

  const btnStyle = (active) => ({
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)",
    background: active ? "rgba(255,255,255,0.12)" : "transparent",
    color: "white",
    textDecoration: "none",
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  });

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 50, background: "#000" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12 }}>
        <div style={{ fontWeight: 900, color: "white", marginRight: 10 }}>eitaCar</div>

        {/* Login aparece sempre */}
        <Link href="/login" style={btnStyle(isActive("/login"))}>
          Login
        </Link>

        {/* Só aparece quando está logado */}
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
          </>
        )}

        {/* Admin só aparece se estiver logado e for o email admin */}
        {isLogged && adminEmail && userEmail === adminEmail && (
          <Link href="/admin" style={btnStyle(isActive("/admin"))}>
            Admin
          </Link>
        )}

        <div style={{ flex: 1 }} />

        {/* Voltar (opcional) */}
        <button
          onClick={() => router.back()}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "transparent",
            color: "white",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Voltar
        </button>
      </div>

      <div style={{ height: 1, background: "rgba(255,255,255,0.12)" }} />
    </div>
  );
}


