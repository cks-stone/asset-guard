import Link from "next/link";
import { HandoverConsole } from "@/components/handover-console";

export default function HandoverPage() {
  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-8">
      <div className="flex w-full max-w-2xl items-center justify-between">
        <h1 className="text-2xl font-bold">렌탈 자산 콘솔</h1>
        <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-200">
          ← 홈
        </Link>
      </div>
      <HandoverConsole />
    </main>
  );
}