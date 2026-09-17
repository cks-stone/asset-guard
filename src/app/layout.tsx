import type { Metadata } from "next";
import type { ReactNode } from "react";
import { WalletProvider } from "@/lib/wallet/wallet-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Asset-Guard — 사내 자산 인수인계 시스템",
  description:
    "웹3 지갑 로그인 기반 사내/렌탈 자산 인수인계. 블록체인(Devnet) 감사 추적으로 책임 소재를 보존합니다.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}