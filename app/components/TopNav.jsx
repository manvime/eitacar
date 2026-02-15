"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import "@/lib/firebaseClient";

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState(null);
  const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "").toLowerCase();

  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, (u) => setUser(u || null));
  }, []);

  const isLoggedIn = !!user;
  const isVerified = !!user?.emailVerified;
  const canAccessPrivate = isLoggedIn && isVerified;

  const userEmail = (user?.email || "").toLowerCase();
  const isAdmin = !!adminEmail && userEmail === adminEmail;

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
    whiteSpace: "nowrap",
  });

  async function handleLogout() {
    try {
      await signOut(getAuth());
      router.push("/login");
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 50, background: "#000" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12 }}>
        <div style={{ fontWeight: 800, color: "white", marginRight: 10 }}>eitaCar</div>

        {!canAccessPrivate && (
          <Link href="/login" style={btnStyle(isActive("/login"))}>
            Login
          </Link>
        )}

        {canAccessPrivate && (
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
            {isAdmin && (
              <Link href="/admin" style={btnStyle(isActive("/admin"))}>
                Admin
              </Link>
            )}
          </>
        )}

        <div style={{ flex: 1 }} />

        {canAccessPrivate && (
          <button onClick={handleLogout} style={btnStyle(false)}>
            Sair
          </button>
        )}
      </div>

      <div style={{ height: 1, background: "rgba(255,255,255,0.12)" }} />
    </div>
  );
}
