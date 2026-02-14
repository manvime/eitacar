"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
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

  const isActive = (href) => pathname === href;

  const btnStyle = (active) => ({
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)",
    background: active ? "rgba(255,255,255,0.12)" : "transparent",
    color: "white",
    textDecoration: "none",
    fontWeight: 600,
  });

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 50, background: "#000" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12 }}>
        <div style={{ fontWeight: 800, color: "white", marginRight: 10 }}>olaCar</div>

        <Link href="/login" style={btnStyle(isActive("/login"))}>Login</Link>
        <Link href="/buscar" style={btnStyle(isActive("/buscar"))}>Buscar</Link>
        <Link href="/chats" style={btnStyle(isActive("/chats"))}>Chats</Link>

        {/* Admin só aparece pro seu email */}
        {adminEmail && userEmail === adminEmail && (
          <Link href="/admin" style={btnStyle(isActive("/admin"))}>Admin</Link>
        )}

        <div style={{ flex: 1 }} />

        <button
          onClick={() => router.back()}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "transparent",
            color: "white",
            fontWeight: 600,
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
