import "./globals.css";
import TopNav from "./components/TopNav";

// Ajuste oficial do Next (App Router) para viewport no mobile
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          background: "#000",
          color: "#fff",
          minHeight: "100vh",
          WebkitTextSizeAdjust: "100%", // evita “letra minúscula”/auto-ajuste estranho no iOS/Android
        }}
      >
        <TopNav />

        <div
          style={{
            padding: "clamp(12px, 3vw, 20px)", // padding responsivo (mobile menor / desktop maior)
          }}
        >
          {children}
        </div>
      </body>
    </html>
  );
}
