import "./globals.css";
import TopNav from "./components/TopNav";

export const metadata = {
  title: "eitaCar",
  description: "eitaCar",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: "#000", color: "#fff" }}>
        <TopNav />
        <div style={{ padding: 20 }}>{children}</div>
      </body>
    </html>
  );
}
