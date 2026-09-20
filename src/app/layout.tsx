import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppProviders } from "@/components/app-providers";
import { ChatBot } from "@/components/chat-bot";
import "./globals.css";
import "@xyflow/react/dist/style.css";

export const metadata: Metadata = {
  title: "Asset-Guard — 렌탈 자산 관리 시스템",
  description:
    "웹3 지갑 로그인 기반 회사 렌탈 자산 관리. 관리번호·모델명·렌탈료·청구·기간·상태를 기록하고 담당자 배정과 인수인계 내역을 관리합니다.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        <AppProviders>{children}</AppProviders>
        <ChatBot />
      </body>
    </html>
  );
}