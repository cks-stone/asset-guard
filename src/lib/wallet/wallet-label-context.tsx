"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWallet } from "./wallet-context";

export interface WalletProfile {
  label: string | null;
  division: string | null;
  department: string | null;
}

interface WalletLabelContextValue {
  label: string | null;
  division: string | null;
  department: string | null;
  loading: boolean;
  open: boolean;
  saving: boolean;
  error: string | null;
  setOpen(open: boolean): void;
  save(profile: {
    label: string;
    division?: string;
    department?: string;
  }): Promise<void>;
  refresh(): Promise<void>;
}

const WalletLabelContext = createContext<WalletLabelContextValue | null>(null);

const SKIP_KEY = "asset-guard:label-skip";

function readSkipped(pk: string): string[] {
  try {
    const raw = window.sessionStorage.getItem(`${SKIP_KEY}:${pk}`);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function markSkipped(pk: string) {
  try {
    window.sessionStorage.setItem(
      `${SKIP_KEY}:${pk}`,
      JSON.stringify([...readSkipped(pk), pk]),
    );
  } catch {
    // 스토리지 불가 시 무시
  }
}

const emptyDraft = { label: "", division: "", department: "" };

export function WalletLabelProvider({ children }: { children: ReactNode }) {
  const { publicKey } = useWallet();

  const [label, setLabel] = useState<string | null>(null);
  const [division, setDivision] = useState<string | null>(null);
  const [department, setDepartment] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedFor, setResolvedFor] = useState<string | null>(null);
  const [promptedFor, setPromptedFor] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const dirtyRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!publicKey) {
      setLabel(null);
      setDivision(null);
      setDepartment(null);
      setResolvedFor(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet-label", {
        headers: { "x-wallet": publicKey },
      });
      const json = (await res.json()) as {
        error?: string;
        label?: string | null;
        division?: string | null;
        department?: string | null;
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setLabel(json.label ?? null);
      setDivision(json.division ?? null);
      setDepartment(json.department ?? null);
    } catch (err) {
      console.error("[wallet-profile] 조회 실패:", err);
      setLabel(null);
      setDivision(null);
      setDepartment(null);
    } finally {
      setResolvedFor(publicKey);
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 프로필 조회가 끝난 직후, 아직 이름이 없으면 세션당 1회 입력 창 표시
  useEffect(() => {
    if (!publicKey) return;
    if (resolvedFor !== publicKey) return;
    if (label != null) return;
    if (dirtyRef.current) return;
    dirtyRef.current = true;
    if (readSkipped(publicKey).includes(publicKey)) return;
    if (promptedFor === publicKey) return;
    setPromptedFor(publicKey);
    setOpen(true);
  }, [publicKey, resolvedFor, label, promptedFor]);

  const save = useCallback(
    async (profile: { label: string; division?: string; department?: string }) => {
      const labelVal = profile.label.trim();
      const divisionVal = (profile.division ?? "").trim();
      const departmentVal = (profile.department ?? "").trim();
      if (!publicKey) return;
      if (labelVal.length === 0) {
        setError("이름을 입력해 주세요");
        return;
      }
      if (labelVal.length > 60 || divisionVal.length > 64 || departmentVal.length > 64) {
        setError("이름 60자, 부문/팀 64자 이하로 입력해 주세요");
        return;
      }
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/wallet-label", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-wallet": publicKey },
          body: JSON.stringify({
            label: labelVal,
            division: divisionVal || null,
            department: departmentVal || null,
          }),
        });
        const json = (await res.json()) as { error?: string; label?: string };
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        setLabel(json.label ?? labelVal);
        setDivision(divisionVal || null);
        setDepartment(departmentVal || null);
        setOpen(false);
        setDraft(emptyDraft);
      } catch (err) {
        setError(err instanceof Error ? err.message : "프로필 저장 실패");
      } finally {
        setSaving(false);
      }
    },
    [publicKey],
  );

  const closeWithoutSave = useCallback(() => {
    if (promptedFor) markSkipped(promptedFor);
    setOpen(false);
  }, [promptedFor]);

  return (
    <WalletLabelContext.Provider
      value={{
        label,
        division,
        department,
        loading,
        open,
        saving,
        error,
        setOpen,
        save,
        refresh,
      }}
    >
      {children}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-neutral-100">
              내 정보를 입력해 주세요
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-neutral-500">
              입력한 이름/부문/팀은 인수인계 시 대상자를 검색·선택하는 지갑 디렉토리와
              이관 그래프에 표시됩니다. 언제든 상단 지갑 정보에서 수정할 수 있습니다.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-neutral-400">이름 *</label>
                <input
                  autoFocus
                  value={draft.label}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, label: e.target.value }));
                    setError(null);
                  }}
                  placeholder="예: 김철수"
                  maxLength={60}
                  className="mt-1 w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-violet-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-neutral-400">부문</label>
                  <input
                    value={draft.division}
                    onChange={(e) => {
                      setDraft((d) => ({ ...d, division: e.target.value }));
                      setError(null);
                    }}
                    placeholder="예: A부문"
                    maxLength={64}
                    className="mt-1 w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-400">팀</label>
                  <input
                    value={draft.department}
                    onChange={(e) => {
                      setDraft((d) => ({ ...d, department: e.target.value }));
                      setError(null);
                    }}
                    placeholder="예: AAAA팀"
                    maxLength={64}
                    className="mt-1 w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-violet-500"
                  />
                </div>
              </div>
            </div>
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={closeWithoutSave}
                className="rounded px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200"
              >
                나중에
              </button>
              <button
                onClick={() =>
                  void save({
                    label: draft.label,
                    division: draft.division,
                    department: draft.department,
                  })
                }
                disabled={saving || draft.label.trim().length === 0}
                className="rounded bg-violet-600 px-4 py-1.5 text-sm text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </WalletLabelContext.Provider>
  );
}

export function useWalletLabel(): WalletLabelContextValue {
  const ctx = useContext(WalletLabelContext);
  if (!ctx) {
    throw new Error("useWalletLabel은 <WalletLabelProvider> 안에서 사용해야 합니다");
  }
  return ctx;
}