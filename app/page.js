import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "calc(100vh - 60px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#000",
        color: "#fff",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "min(720px, 100%)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 16,
          padding: 24,
          background: "rgba(255,255,255,0.03)",
          boxShadow: "0 0 40px rgba(0,0,0,0.6)",
          textAlign: "center",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 28, marginBottom: 14 }}>eitaCar</div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: 18,
          }}
        >
          <div
            style={{
              width: 280,
              height: 180,
              borderRadius: 14,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* precisa existir em /public/icons/logo.jpg */}
            <Image
              src="/icons/logo.jpg"
              alt="eitaCar logo"
              width={560}
              height={360}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
              priority
            />
          </div>
        </div>

        <Link
          href="/login"
          style={{
            display: "inline-block",
            padding: "10px 18px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.10)",
            color: "white",
            textDecoration: "none",
            fontWeight: 800,
          }}
        >
          Login
        </Link>
      </div>
    </main>
  );
}
