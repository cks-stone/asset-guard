import Link from "next/link";
import { Dashboard } from "@/components/dashboard";
import { WalletStatus } from "@/components/wallet-status";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-8">
      <header className="flex w-full max-w-3xl items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Asset-Guard</h1>
        <div className="flex items-center gap-3">
          <nav className="flex gap-3">
            <Link
              href="/handover"
              className="rounded-lg border border-neutral-700 px-4 py-1.5 text-sm text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white"
            >
              렌탈 자산 콘솔
            </Link>
            <Link
              href="/admin"
              className="rounded-lg border border-neutral-700 px-4 py-1.5 text-sm text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white"
            >
              관리자 콘솔
            </Link>
          </nav>
          <WalletStatus />
        </div>
      </header>
      <Dashboard />
    </main>
  );
}