"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@/lib/wallet/wallet-context";
import {
  completeAcceptFromPartial,
  createHandover,
  createPartialSignature,
  getAssetGuardProgramId,
} from "@/lib/anchor/asset-guard";
import { findHandoverPda } from "@/lib/solana/pda";
import type { AssetRow, HandoverRow } from "@/lib/supabase/types";

async function readJson(res: Response): Promise<{ error?: string; [k: string]: unknown }> {
  try {
    return (await res.json()) as { error?: string };
  } catch {
    return { error: `HTTP ${res.status}` };
  }
}

export function HandoverConsole() {
  const { adapter, publicKey, connected, connect } = useWallet();

  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [asTo, setAsTo] = useState<HandoverRow[]>([]);
  const [asFrom, setAsFrom] = useState<HandoverRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [toWallet, setToWallet] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [blobs, setBlobs] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    if (!publicKey) return;
    setError(null);
    try {
      const [assetRes, asToRes, asFromRes] = await Promise.all([
        fetch("/api/assets"),
        fetch(`/api/handovers?to_wallet=${encodeURIComponent(publicKey)}&status=pending`),
        fetch(
          `/api/handovers?from_wallet=${encodeURIComponent(publicKey)}&status=pending`,
        ),
      ]);
      const assetsData = (await readJson(assetRes)) as { data?: AssetRow[] };
      const asToData = (await readJson(asToRes)) as { data?: HandoverRow[] };
      const asFromData = (await readJson(asFromRes)) as { data?: HandoverRow[] };
      setAssets(assetsData.data ?? []);
      setAsTo(asToData.data ?? []);
      setAsFrom(asFromData.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "목록 조회 실패");
    }
  }, [publicKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const myAssets = useMemo(
    () =>
      assets.filter(
        (a) =>
          a.status !== "retired" &&
          (a.custodian_wallet === publicKey || !a.custodian_wallet),
      ),
    [assets, publicKey],
  );

  const handleCreate = async () => {
    if (!adapter || !publicKey || !selectedAssetId || !toWallet) return;
    const asset = assets.find((a) => a.id === selectedAssetId);
    if (!asset) return;
    setBusy("create");
    setError(null);
    setNotice(null);
    try {
      const txSignature = await createHandover(adapter, {
        assetId: asset.id,
        assetCode: asset.asset_code,
        to: toWallet,
      });
      const { pda } = await findHandoverPda(
        getAssetGuardProgramId().toString(),
        asset.id,
        publicKey,
        toWallet,
      );
      const res = await fetch("/api/handovers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: asset.id,
          from_wallet: publicKey,
          to_wallet: toWallet,
          onchain_pda: pda.toString(),
          tx_signature: txSignature,
        }),
      });
      const json = await readJson(res);
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setNotice(`인계 신청 완료. tx: ${txSignature}`);
      setToWallet("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "인계 신청 실패");
    } finally {
      setBusy(null);
    }
  };

  const handlePrepare = async (h: HandoverRow) => {
    if (!adapter) return;
    setBusy(`prepare-${h.id}`);
    setError(null);
    setNotice(null);
    try {
      const blob = await createPartialSignature(adapter, {
        assetId: h.asset_id,
        from: h.from_wallet,
        to: h.to_wallet,
      });
      const res = await fetch("/api/handovers/accept/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handover_id: h.id, partial_tx: blob }),
      });
      const json = await readJson(res);
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setBlobs((prev) => ({ ...prev, [h.id]: blob }));
      setNotice("인수자 서명 완료. 이제 인계자가 최종 서명해야 합니다.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "수락 준비 실패");
    } finally {
      setBusy(null);
    }
  };

  const handleFinalize = async (h: HandoverRow) => {
    if (!adapter) return;
    if (!h.partial_tx) return;
    setBusy(`finalize-${h.id}`);
    setError(null);
    setNotice(null);
    try {
      const txSignature = await completeAcceptFromPartial(adapter, h.partial_tx);
      const res = await fetch("/api/handovers/accept/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handover_id: h.id,
          tx_signature: txSignature,
          asset_id: h.asset_id,
          from_wallet: h.from_wallet,
          to_wallet: h.to_wallet,
        }),
      });
      const json = await readJson(res);
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResults((prev) => ({ ...prev, [h.id]: txSignature }));
      setNotice("인수 확정. 렌탈 자산 담당자가 갱신되었습니다.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "최종 서명 실패");
    } finally {
      setBusy(null);
    }
  };

  if (!connected) {
    return (
      <div className="w-full max-w-2xl rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-center">
        <p className="text-sm text-neutral-400">
          렌탈 자산 콘솔 사용을 위해 지갑을 연결하세요.
        </p>
        <button
          onClick={() => void connect()}
          className="mt-4 rounded bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-500"
        >
          지갑 연결
        </button>
      </div>
    );
  }

  const relayable = asFrom.filter((h) => h.partial_tx);

  return (
    <div className="w-full max-w-2xl space-y-6">
      {error && (
        <p className="rounded bg-red-950/60 px-4 py-2 text-sm text-red-300">{error}</p>
      )}
      {notice && (
        <p className="rounded bg-emerald-950/60 px-4 py-2 text-sm text-emerald-300">
          {notice}
        </p>
      )}

      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="text-lg font-semibold">1. 인계 신청 (인계자 · 현재 렌탈 사용자)</h2>
        <div className="mt-4 space-y-3">
          <select
            value={selectedAssetId}
            onChange={(e) => setSelectedAssetId(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
          >
            <option value="">내가 렌탈 중이거나 미배정인 렌탈 자산 선택</option>
            {myAssets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.asset_code} — {a.name}
              </option>
            ))}
          </select>
          <input
            value={toWallet}
            onChange={(e) => setToWallet(e.target.value)}
            placeholder="신규 담당자(인수자) 지갑 주소 (to)"
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm font-mono"
          />
          <button
            onClick={() => void handleCreate()}
            disabled={busy !== null || !selectedAssetId || toWallet.length < 32}
            className="w-full rounded bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {busy === "create" ? "서명 요청 중..." : "인계 신청"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="text-lg font-semibold">2. 인수 수락 (인수자 · 새 담당자)</h2>
        {asTo.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            나에게 신청된 인계(인수인계)가 없습니다.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {asTo.map((h) => (
              <li key={h.id} className="rounded border border-neutral-800 bg-neutral-800/40 p-3">
                <p className="text-sm">
                  <span className="font-mono">{h.asset_code}</span> · {h.from_wallet.slice(0, 8)}…
                </p>
                {blobs[h.id] ? (
                  <p className="mt-2 max-w-full break-all rounded bg-neutral-950 p-2 text-[10px] font-mono text-neutral-400">
                    {blobs[h.id]}
                  </p>
                ) : (
                  <button
                    onClick={() => void handlePrepare(h)}
                    disabled={busy !== null}
                    className="mt-2 rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500 disabled:opacity-50"
                  >
                    {busy === `prepare-${h.id}` ? "서명 중..." : "인수자 서명 (부분 서명 준비)"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="text-lg font-semibold">3. 인수 확정 (인계자)</h2>
        {relayable.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            인수자의 서명을 기다리는 인수인계가 없습니다.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {relayable.map((h) => (
              <li key={h.id} className="rounded border border-neutral-800 bg-neutral-800/40 p-3">
                <p className="text-sm">
                  <span className="font-mono">{h.asset_code}</span> →{" "}
                  <span className="font-mono">{h.to_wallet.slice(0, 8)}…</span>
                </p>
                {results[h.id] ? (
                  <p className="mt-2 break-all font-mono text-xs text-emerald-300">
                    완료 tx: {results[h.id]}
                  </p>
                ) : (
                  <button
                    onClick={() => void handleFinalize(h)}
                    disabled={busy !== null}
                    className="mt-2 rounded bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {busy === `finalize-${h.id}` ? "확정 중..." : "최종 서명 & 인수 확정"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}