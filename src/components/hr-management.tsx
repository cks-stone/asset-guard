"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@/lib/wallet/wallet-context";
import { EMPLOYMENT_STATUSES, WORK_LOCATIONS } from "@/lib/supabase/types";
import type { EmploymentStatus, WorkLocation } from "@/lib/supabase/types";
import type { EmployeeProfileView } from "@/app/api/employees/route";

async function readJson(res: Response): Promise<{ error?: string; [k: string]: unknown }> {
  try {
    return (await res.json()) as { error?: string };
  } catch {
    return { error: `HTTP ${res.status}` };
  }
}

const shortAddr = (addr: string | null | undefined) =>
  addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "—";

interface HrDraft {
  user_name: string;
  employment_status: EmploymentStatus;
  work_location: WorkLocation;
  job_title: string;
  hire_date: string;
  departure_date: string;
  note: string;
}

const emptyHrDraft = (user: string): HrDraft => ({
  user_name: user,
  employment_status: "재직",
  work_location: "본사",
  job_title: "",
  hire_date: "",
  departure_date: "",
  note: "",
});

export function HrManagement() {
  const { publicKey, connected, connect } = useWallet();
  const [adminWallets, setAdminWallets] = useState<string[]>([]);

  const [hrList, setHrList] = useState<EmployeeProfileView[]>([]);
  const [hrDrafts, setHrDrafts] = useState<Record<string, HrDraft>>({});
  const [hrQ, setHrQ] = useState("");
  const [hrBusy, setHrBusy] = useState<string | null>(null);
  const [hrNewUser, setHrNewUser] = useState("");
  const hrQRef = useRef("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
      adminWallets.some((w) => w.toLowerCase() === publicKey.toLowerCase()),
    [connected, publicKey, adminWallets],
  );

  const fetchHr = useCallback(
    async (q?: string) => {
      if (!isAdmin || !publicKey) return;
      const query = (q ?? hrQRef.current).trim();
      try {
        const url = `/api/employees${query ? `?q=${encodeURIComponent(query)}` : ""}`;
        const res = await fetch(url, { headers: { "x-admin-wallet": publicKey } });
        const json = (await readJson(res)) as {
          error?: string;
          data?: EmployeeProfileView[];
        };
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        const list = json.data ?? [];
        setHrList(list);
        setHrDrafts((prev) => {
          const next = { ...prev };
          for (const p of list) {
            if (!next[p.user_name]) {
              next[p.user_name] = {
                ...emptyHrDraft(p.user_name),
                employment_status: p.employment_status ?? "재직",
                work_location: p.work_location ?? "본사",
                job_title: p.job_title ?? "",
                hire_date: p.hire_date ?? "",
                departure_date: p.departure_date ?? "",
                note: p.note ?? "",
              };
            }
          }
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "인사 정보 조회 실패");
      }
    },
    [isAdmin, publicKey],
  );

  useEffect(() => {
    if (isAdmin) void fetchHr();
  }, [isAdmin, fetchHr]);

  if (!connected) {
    return (
      <div className="w-full max-w-4xl rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-center">
        <p className="text-sm text-neutral-400">
          인사 정보 관리를 사용하려면 지갑을 연결하세요.
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
      <div className="w-full max-w-4xl rounded-xl border border-red-900/60 bg-red-950/40 p-6 text-center">
        <p className="text-sm text-red-300">
          연결된 지갑({shortAddr(publicKey)})은 관리자 화이트리스트에 없습니다.
        </p>
      </div>
    );
  }

  const setHrDraft = (user: string, patch: Partial<HrDraft>) => {
    setHrDrafts((prev) => ({
      ...prev,
      [user]: { ...(prev[user] ?? emptyHrDraft(user)), ...patch },
    }));
  };

  const saveHr = async (user: string) => {
    if (!isAdmin || !publicKey) return;
    const d = hrDrafts[user];
    if (!d) return;
    setHrBusy(user);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-wallet": publicKey,
        },
        body: JSON.stringify({
          user_name: d.user_name,
          employment_status: d.employment_status,
          work_location: d.work_location,
          job_title: d.job_title || null,
          hire_date: d.hire_date || null,
          departure_date: d.departure_date || null,
          note: d.note || null,
        }),
      });
      const json = await readJson(res);
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setNotice(`"${d.user_name}" 인사 정보 저장 완료.`);
      setHrNewUser("");
      void fetchHr();
    } catch (err) {
      setError(err instanceof Error ? err.message : "인사 정보 저장 실패");
    } finally {
      setHrBusy(null);
    }
  };

  const registerHr = async () => {
    if (!isAdmin || !publicKey) return;
    const name = hrNewUser.trim();
    if (!name) return;
    setHrBusy("__new__");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-wallet": publicKey,
        },
        body: JSON.stringify({
          user_name: name,
          employment_status: "재직",
          work_location: "본사",
        }),
      });
      const json = await readJson(res);
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setNotice(`"${name}" 인사 프로필 등록 완료.`);
      setHrNewUser("");
      void fetchHr();
    } catch (err) {
      setError(err instanceof Error ? err.message : "인사 프로필 등록 실패");
    } finally {
      setHrBusy(null);
    }
  };

  return (
    <div className="w-full max-w-[1400px] space-y-6">
      {error && (
        <p className="rounded bg-red-950/60 px-4 py-2 text-sm text-red-300">{error}</p>
      )}
      {notice && (
        <p className="rounded bg-emerald-950/60 px-4 py-2 text-sm text-emerald-300">
          {notice}
        </p>
      )}

      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <h2 className="text-lg font-semibold">
            인사 정보 관리 ({hrList.length})
            <span className="ml-2 align-middle text-xs font-normal text-neutral-500">
              월간 리포팅(퇴직·휴직·신규입사·재택·지사/출장, 만기 예고)의 판단 기준
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={hrQ}
              onChange={(e) => {
                setHrQ(e.target.value);
                hrQRef.current = e.target.value;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void fetchHr(hrQ);
              }}
              placeholder="이름/부문/팀 검색"
              className="rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm"
            />
            <button
              onClick={() => void fetchHr(hrQ)}
              disabled={hrBusy !== null}
              className="rounded bg-neutral-700 px-3 py-1.5 text-sm transition hover:bg-neutral-600 disabled:opacity-50"
            >
              검색
            </button>
          </div>
        </div>

        <div className="pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={hrNewUser}
              disabled={hrBusy === "__new__"}
              onChange={(e) => setHrNewUser(e.target.value)}
              placeholder="렌탈리스트 외 사용자 이름으로 새 인사 프로필 추가"
              className="min-w-[18rem] flex-1 rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm"
            />
            <button
              onClick={() => void registerHr()}
              disabled={hrBusy === "__new__" || !hrNewUser.trim()}
              className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {hrBusy === "__new__" ? "등록 중…" : "등록"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="border-b border-neutral-700 text-xs text-neutral-500">
                <th className="px-3 py-2 text-left font-medium">이름</th>
                <th className="px-3 py-2 text-left font-medium">출처</th>
                <th className="px-3 py-2 text-left font-medium">부문/팀</th>
                <th className="px-3 py-2 text-left font-medium">인사상태</th>
                <th className="px-3 py-2 text-left font-medium">근무위치</th>
                <th className="px-3 py-2 text-left font-medium">직급</th>
                <th className="px-3 py-2 text-left font-medium">입사일</th>
                <th className="px-3 py-2 text-left font-medium">퇴직(예정)일</th>
                <th className="px-3 py-2 text-left font-medium">비고</th>
                <th className="px-3 py-2 text-left font-medium">저장</th>
              </tr>
            </thead>
            <tbody>
              {hrList.map((p) => {
                const d = hrDrafts[p.user_name] ?? emptyHrDraft(p.user_name);
                const saving = hrBusy === p.user_name;
                return (
                  <tr key={p.user_name} className="border-b border-neutral-800/70 align-middle">
                    <td className="px-3 py-2 text-sm font-medium">{p.user_name}</td>
                    <td className="px-3 py-2">
                      {p.source ? (
                        <span className="rounded bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-300 whitespace-nowrap">
                          {p.source} 인수 대기
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                          입력됨
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-neutral-300">
                      {[p.division, p.department].filter(Boolean).join(" / ") || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={d.employment_status}
                        disabled={saving}
                        onChange={(e) =>
                          setHrDraft(p.user_name, {
                            employment_status: e.target.value as EmploymentStatus,
                          })
                        }
                        className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                      >
                        {EMPLOYMENT_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={d.work_location}
                        disabled={saving}
                        onChange={(e) =>
                          setHrDraft(p.user_name, {
                            work_location: e.target.value as WorkLocation,
                          })
                        }
                        className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                      >
                        {WORK_LOCATIONS.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={d.job_title}
                        disabled={saving}
                        onChange={(e) =>
                          setHrDraft(p.user_name, { job_title: e.target.value })
                        }
                        className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        value={d.hire_date}
                        disabled={saving}
                        onChange={(e) =>
                          setHrDraft(p.user_name, { hire_date: e.target.value })
                        }
                        className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        value={d.departure_date}
                        disabled={saving}
                        onChange={(e) =>
                          setHrDraft(p.user_name, { departure_date: e.target.value })
                        }
                        className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={d.note}
                        disabled={saving}
                        onChange={(e) =>
                          setHrDraft(p.user_name, { note: e.target.value })
                        }
                        placeholder="—"
                        className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => void saveHr(p.user_name)}
                        disabled={saving}
                        className="rounded bg-neutral-700 px-3 py-1 text-xs transition hover:bg-neutral-600 disabled:opacity-50"
                      >
                        {saving ? "저장 중…" : "저장"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!hrList.length && (
                <tr>
                  <td colSpan={10} className="px-3 py-4 text-center text-sm text-neutral-500">
                    인사 프로필이 없습니다. 위 입력란에 사용자 이름을 넣고 등록해 주세요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}