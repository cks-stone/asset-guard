import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppProviders } from "@/components/app-providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Asset-Guard — 회사 렌탈 자산 관리 시스템",
  description:
    "웹3 지갑 로그인 기반 회사 렌탈 자산 인수인계. 블록체인(Devnet) 감사 추적으로 재직 기간 담당 이력과 책임 소재를 보존합니다.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}