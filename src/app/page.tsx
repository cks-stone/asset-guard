import { Dashboard } from "@/components/dashboard";
import { WalletStatus } from "@/components/wallet-status";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-8">
      <header className="flex w-full max-w-[2000px] items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Asset-Guard</h1>
        <div className="flex items-center gap-3">
          <WalletStatus />
        </div>
      </header>
      <Dashboard />
    </main>
  );
}