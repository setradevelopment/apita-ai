import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Apita aí — Gestão Esportiva",
  description: "Plataforma de gestão para times e atletas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${geistMono.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        {/* Provider global de confirm/alert. Substitui `window.confirm` e
            `window.alert` nativos (renderização feia do browser) por um
            Dialog customizado centralizado. Qualquer client component usa
            via `const { confirm, alert } = useConfirm()`. */}
        <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
      </body>
    </html>
  );
}
