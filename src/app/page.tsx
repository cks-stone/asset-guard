export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">Asset-Guard</h1>
      <p className="max-w-xl text-center text-neutral-400">
        사내/렌탈 자산 인수인계 웹 시스템. M1에서 Anchor 인수인계 프로그램이
        Devnet에 배포되고, M3부터 Phantom 지갑 로그인과 대시보드가 연결됩니다.
      </p>
      <code className="rounded bg-neutral-800 px-3 py-1 text-sm text-neutral-300">
        Solana Devnet / Anchor Program / Supabase / Resend
      </code>
    </main>
  );
}