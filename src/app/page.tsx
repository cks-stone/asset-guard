import Link from "next/link";
import { WalletPanel } from "@/components/wallet-panel";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">Asset-Guard</h1>
      <p className="max-w-xl text-center text-neutral-400">
        사내/렌탈 자산 인수인계 웹 시스템. Anchor 인수인계 프로그램(Devnet),
        Phantom 지갑 연동, 양자서명 인수인계 콘솔을 제공합니다.
      </p>
      <code className="rounded bg-neutral-800 px-3 py-1 text-sm text-neutral-300">
        Solana Devnet / Anchor Program / Supabase / Resend
      </code>
      <WalletPanel />
      <nav className="flex gap-3">
        <Link
          href="/handover"
          className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white"
        >
          인수인계 콘솔
        </Link>
        <Link
          href="/admin"
          className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white"
        >
          관리자 콘솔
        </Link>
      </nav>
    </main>
  );
}