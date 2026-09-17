"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@/lib/wallet/wallet-context";
import type { AssetRow, HandoverRow, RentalType } from "@/lib/supabase/types";

const WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function readJson(res: Response): Promise<{ error?: string; [k: string]: unknown }> {
  try {
    return (await res.json()) as { error?: string };
  } catch {
    return { error: `HTTP ${res.status}` };
  }
}

type Tab = "assets" | "handovers";

const assetStatusBadge: Record<string, string> = {
  available: "bg-blue-500/15 text-blue-300",
  in_use: "bg-emerald-500/15 text-emerald-300",
  retired: "bg-neutral-500/15 text-neutral-400",
};

const handoverStatusBadge: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-300",
  completed: "bg-emerald-500/15 text-emerald-300",
  cancelled: "bg-neutral-500/15 text-neutral-400",
};

const shortAddr = (addr: string | null | undefined) =>
  addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "—";

const rentalTypeLabel: Record<RentalType, string> = {
  company_owned: "회사 보유",
  leased: "임대",
};

const fmtFee = (n: number | null | undefined) =>
  n == null ? "" : `월 ${n.toLocaleString()}원`;

const fmtPeriod = (a: AssetRow) => {
  if (!a.rental_start_at && !a.rental_end_at) return "";
  return `${a.rental_start_at ?? "?"} ~ ${a.rental_end_at ?? "?"}`;
};

export function AdminConsole() {
  const { publicKey, connected, connect } = useWallet();
  const [adminWallets, setAdminWallets] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("assets");

  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [handovers, setHandovers] = useState<HandoverRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    asset_code: "",
    name: "",
    category: "",
    description: "",
    custodian_wallet: "",
    status: "available",
    rental_type: "company_owned",
    rental_start_at: "",
    rental_end_at: "",
    rental_fee: "",
    rental_terms: "",
  });

  useEffect(() => {
    void fetch("/api/admin/config")
      .then((r) => r.json())
      .then((j) => {
        const list = (j.adminWallets as string[] | undefined) ?? [];
        setAdminWallets(list);
      })
      .catch(() => setAdminWallets([]));
  }, []);

  const isAdmin = useMemo(
    () =>
      connected &&
      publicKey !== null &&
      adminWallets.some(
        (w) => w.toLowerCase() === publicKey.toLowerCase(),
      ),
    [connected, publicKey, adminWallets],
  );

  const headers = useMemo(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (publicKey) h["x-admin-wallet"] = publicKey;
    return h;
  }, [publicKey]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [assetRes, handoverRes] = await Promise.all([
        fetch("/api/assets"),
        fetch(
          statusFilter ? `/api/handovers?status=${statusFilter}` : "/api/handovers",
        ),
      ]);
      const assetsData = (await readJson(assetRes)) as { data?: AssetRow[] };
      const handoverData = (await readJson(handoverRes)) as { data?: HandoverRow[] };
      setAssets(assetsData.data ?? []);
      setHandovers(handoverData.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "목록 조회 실패");
    }
  }, [statusFilter]);

  useEffect(() => {
    if (isAdmin) void refresh();
  }, [isAdmin, refresh]);

  const handleCreate = async () => {
    if (!isAdmin || !publicKey) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const body: Record<string, string | number | null> = {
        asset_code: form.asset_code.trim(),
        name: form.name.trim(),
        status: form.status,
        rental_type: form.rental_type as RentalType,
      };
      if (form.category.trim()) body.category = form.category.trim();
      else body.category = null;
      if (form.description.trim()) body.description = form.description.trim();
      else body.description = null;
      if (form.custodian_wallet.trim()) {
        if (!WALLET_RE.test(form.custodian_wallet.trim())) {
          throw new Error("담당자 주소 형식이 올바르지 않습니다");
        }
        body.custodian_wallet = form.custodian_wallet.trim();
      } else {
        body.custodian_wallet = null;
      }
      if (form.rental_start_at.trim()) body.rental_start_at = form.rental_start_at.trim();
      else body.rental_start_at = null;
      if (form.rental_end_at.trim()) body.rental_end_at = form.rental_end_at.trim();
      else body.rental_end_at = null;
      if (form.rental_fee.trim()) {
        const fee = Number(form.rental_fee);
        if (Number.isNaN(fee) || fee < 0) throw new Error("렌탈비는 0 이상 숫자여야 합니다");
        body.rental_fee = fee;
      } else {
        body.rental_fee = null;
      }
      if (form.rental_terms.trim()) body.rental_terms = form.rental_terms.trim();
      else body.rental_terms = null;

      const res = await fetch("/api/assets", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const json = await readJson(res);
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setForm({
        asset_code: "",
        name: "",
        category: "",
        description: "",
        custodian_wallet: "",
        status: "available",
        rental_type: "company_owned",
        rental_start_at: "",
        rental_end_at: "",
        rental_fee: "",
        rental_terms: "",
      });
      setNotice("렌탈 자산이 등록되었습니다.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "등록 실패");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async (
    asset: AssetRow,
    patch: Partial<
      Pick<
        AssetRow,
        | "name"
        | "category"
        | "description"
        | "custodian_wallet"
        | "status"
        | "rental_type"
        | "rental_start_at"
        | "rental_end_at"
        | "rental_fee"
        | "rental_terms"
      >
    >,
  ) => {
    if (!isAdmin || !publicKey) return;
    if (patch.custodian_wallet && !WALLET_RE.test(patch.custodian_wallet)) {
      setError("담당자 주소 형식이 올바르지 않습니다");
      return;
    }
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/assets/${asset.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(patch),
    });
    const json = await readJson(res);
    if (!res.ok || json.error) {
      setError(json.error ?? `HTTP ${res.status}`);
      return;
    }
    setNotice(`${asset.asset_code} 업데이트 완료.`);
    await refresh();
  };

  if (!connected) {
    return (
      <div className="w-full max-w-3xl rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-center">
        <p className="text-sm text-neutral-400">
          관리자 콘솔 사용을 위해 지갑을 연결하세요.
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

  if (!isAdmin) {
    return (
      <div className="w-full max-w-3xl rounded-xl border border-red-900/60 bg-red-950/40 p-6 text-center">
        <p className="text-sm text-red-300">
          연결된 지갑({shortAddr(publicKey)})은 관리자 화이트리스트에 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl space-y-6">
      {error && (
        <p className="rounded bg-red-950/60 px-4 py-2 text-sm text-red-300">{error}</p>
      )}
      {notice && (
        <p className="rounded bg-emerald-950/60 px-4 py-2 text-sm text-emerald-300">
          {notice}
        </p>
      )}

      <div className="flex gap-2">
        {(
          [
            ["assets", "렌탈 자산 관리"],
            ["handovers", "인수인계 내역"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded px-4 py-1.5 text-sm ${
              tab === key
                ? "bg-neutral-200 text-neutral-900"
                : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "assets" && (
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
          <h2 className="text-lg font-semibold">렌탈 자산 등록</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <input
              value={form.asset_code}
              onChange={(e) => setForm({ ...form, asset_code: e.target.value })}
              placeholder="렌탈 자산 코드 (예: NB-0001)"
              className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
            />
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="자산명 (예: 맥북 프로 14인치)"
              className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
            />
            <input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="카테고리 (예: 노트북)"
              className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
            />
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="상세 설명"
              className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
            />
            <input
              value={form.custodian_wallet}
              onChange={(e) => setForm({ ...form, custodian_wallet: e.target.value })}
              placeholder="담당자 지갑 (선택)"
              className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm font-mono"
            />
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
            >
              <option value="available">available</option>
              <option value="in_use">in_use</option>
              <option value="retired">retired</option>
            </select>
            <select
              value={form.rental_type}
              onChange={(e) => setForm({ ...form, rental_type: e.target.value })}
              className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
            >
              <option value="company_owned">회사 보유</option>
              <option value="leased">임대 (외부 렌탈사)</option>
            </select>
            <input
              type="date"
              value={form.rental_start_at}
              onChange={(e) => setForm({ ...form, rental_start_at: e.target.value })}
              placeholder="렌탈 시작일"
              className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={form.rental_end_at}
              onChange={(e) => setForm({ ...form, rental_end_at: e.target.value })}
              placeholder="예정 반납일"
              className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
            />
            <input
              type="number"
              min={0}
              value={form.rental_fee}
              onChange={(e) => setForm({ ...form, rental_fee: e.target.value })}
              placeholder="월 렌탈비 (원, 선택)"
              className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
            />
          </div>
          <input
            value={form.rental_terms}
            onChange={(e) => setForm({ ...form, rental_terms: e.target.value })}
            placeholder="렌탈 조건/비고 (예: 분실 시 본인 부담)"
            className="mt-3 w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
          />
          <button
            onClick={() => void handleCreate()}
            disabled={busy || !form.asset_code.trim() || !form.name.trim()}
            className="mt-4 rounded bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {busy ? "등록 중..." : "렌탈 자산 등록"}
          </button>
        </section>
      )}

      {tab === "assets" && (
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
          <h2 className="text-lg font-semibold">전체 렌탈 자산 ({assets.length})</h2>
          <ul className="mt-4 space-y-3">
            {assets.map((a) => (
              <li key={a.id} className="rounded border border-neutral-800 bg-neutral-800/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm">{a.asset_code}</span>
                  <span className="text-sm">{a.name}</span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      assetStatusBadge[a.status] ?? assetStatusBadge.available
                    }`}
                  >
                    {a.status}
                  </span>
                  <span className="text-xs text-neutral-500">
                    담당: {shortAddr(a.custodian_wallet)}
                  </span>
                  {a.category && (
                    <span className="text-xs text-neutral-500">/{a.category}</span>
                  )}
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      a.rental_type === "leased"
                        ? "bg-amber-500/15 text-amber-300"
                        : "bg-neutral-700/40 text-neutral-300"
                    }`}
                  >
                    {rentalTypeLabel[a.rental_type]}
                  </span>
                  {fmtPeriod(a) && (
                    <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                      {fmtPeriod(a)}
                    </span>
                  )}
                  {a.rental_fee != null && (
                    <span className="text-xs text-neutral-400">{fmtFee(a.rental_fee)}</span>
                  )}
                </div>
                {a.description && (
                  <p className="mt-1 text-xs text-neutral-500">{a.description}</p>
                )}
                {a.rental_terms && (
                  <p className="mt-1 text-[11px] text-neutral-500">
                    렌탈 조건: {a.rental_terms}
                  </p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <input
                    defaultValue={a.name}
                    onBlur={(e) => {
                      if (e.target.value.trim() && e.target.value !== a.name) {
                        void handleUpdate(a, { name: e.target.value.trim() });
                      }
                    }}
                    className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                  />
                  <input
                    defaultValue={a.custodian_wallet ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (a.custodian_wallet ?? "")) {
                        void handleUpdate(a, { custodian_wallet: v || null });
                      }
                    }}
                    placeholder="담당자 지갑 변경"
                    className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs font-mono"
                  />
                  <select
                    defaultValue={a.status}
                    onChange={(e) => {
                      const v = e.target.value as AssetRow["status"];
                      if (v !== a.status) void handleUpdate(a, { status: v });
                    }}
                    className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                  >
                    <option value="available">available</option>
                    <option value="in_use">in_use</option>
                    <option value="retired">retired</option>
                  </select>
                  <select
                    defaultValue={a.rental_type}
                    onChange={(e) => {
                      const v = e.target.value as RentalType;
                      if (v !== a.rental_type) void handleUpdate(a, { rental_type: v });
                    }}
                    className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                  >
                    <option value="company_owned">회사 보유</option>
                    <option value="leased">임대</option>
                  </select>
                  <input
                    type="date"
                    defaultValue={a.rental_end_at ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v !== (a.rental_end_at ?? "")) {
                        void handleUpdate(a, { rental_end_at: v || null });
                      }
                    }}
                    title="예정 반납일 변경"
                    className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                  />
                  <input
                    type="number"
                    min={0}
                    defaultValue={a.rental_fee ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v === "") {
                        if (a.rental_fee != null) void handleUpdate(a, { rental_fee: null });
                        return;
                      }
                      const fee = Number(v);
                      if (!Number.isNaN(fee) && fee >= 0 && fee !== a.rental_fee) {
                        void handleUpdate(a, { rental_fee: fee });
                      }
                    }}
                    placeholder="월 렌탈비"
                    title="월 렌탈비 변경"
                    className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "handovers" && (
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">전체 인수인계 ({handovers.length})</h2>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs"
            >
              <option value="">전체 상태</option>
              <option value="pending">pending</option>
              <option value="completed">completed</option>
              <option value="cancelled">cancelled</option>
            </select>
          </div>
          <ul className="mt-4 space-y-3">
            {handovers.map((h) => (
              <li key={h.id} className="rounded border border-neutral-800 bg-neutral-800/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm">{h.asset_code}</span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      handoverStatusBadge[h.onchain_status] ??
                      handoverStatusBadge.pending
                    }`}
                  >
                    {h.onchain_status}
                  </span>
                  <span className="text-xs text-neutral-400">
                    {shortAddr(h.from_wallet)} → {shortAddr(h.to_wallet)}
                  </span>
                </div>
                <p className="mt-1 text-[10px] font-mono text-neutral-500">
                  {h.onchain_pda ?? "PDA 미기록"}
                </p>
                {h.tx_signature && (
                  <p className="mt-1 break-all text-[10px] font-mono text-neutral-500">
                    tx: {h.tx_signature}
                  </p>
                )}
                <p className="mt-1 text-[10px] text-neutral-600">
                  생성: {new Date(h.created_at).toLocaleString()}
                  {h.completed_at
                    ? ` · 완료: ${new Date(h.completed_at).toLocaleString()}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}