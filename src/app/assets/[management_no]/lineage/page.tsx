import Link from "next/link";
import { LineageView } from "@/components/lineage-view";

export default async function AssetLineagePage({
  params,
}: {
  params: Promise<{ management_no: string }>;
}) {
  const { management_no } = await params;
  const managementNo = decodeURIComponent(management_no);

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-8">
      <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-200">
        ← 홈
      </Link>
      <LineageView managementNo={managementNo} />
    </main>
  );
}