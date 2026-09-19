"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@/lib/wallet/wallet-context";

interface DirectoryEntry {
  wallet_address: string;
  label: string;
  division: string | null;
  department: string | null;
}

interface Props {
  value: string;
  onChange(address: string): void;
  disabled?: boolean;
}

function formatEntry(r: DirectoryEntry) {
  const parts = [r.label];
  if (r.department) parts.push(r.department);
  if (r.division) parts.push(r.division);
  return parts.join(" · ");
}

export function WalletDirectoryPicker({ value, onChange, disabled }: Props) {
  const { publicKey } = useWallet();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDisplay, setSelectedDisplay] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [open]);

  const fetchDirectory = useCallback(
    async (q: string) => {
      if (!publicKey) return;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        const res = await fetch(`/api/wallet-directory?${params.toString()}`, {
          headers: { "x-wallet": publicKey },
        });
        const json = await res.json();
        setResults(Array.isArray(json.data) ? json.data : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [publicKey],
  );

  useEffect(() => {
    if (!open) return;
    void fetchDirectory(query);
  }, [open, query, fetchDirectory]);

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={open ? query : selectedDisplay || (value ? `${value.slice(0, 4)}…${value.slice(-4)}` : "")}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (disabled) return;
          setOpen(true);
          setQuery("");
          setSelectedDisplay("");
        }}
        placeholder="구성원 검색"
        disabled={disabled}
        className="w-48 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-100 outline-none focus:border-violet-500 disabled:opacity-50"
      />
      {value && !open && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            setSelectedDisplay("");
          }}
          className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-neutral-500 hover:text-neutral-300"
        >
          ✕
        </button>
      )}
      {open && (
        <div className="absolute z-40 mt-1 max-h-48 w-64 overflow-auto rounded border border-neutral-700 bg-neutral-900 shadow-xl">
          {loading && <div className="px-3 py-2 text-[11px] text-neutral-500">검색 중...</div>}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-[11px] text-neutral-500">
              {query ? "검색 결과 없음" : "등록된 구성원이 없습니다"}
            </div>
          )}
          {!loading &&
            results.map((r) => (
              <button
                key={r.wallet_address}
                type="button"
                onClick={() => {
                  onChange(r.wallet_address);
                  setSelectedDisplay(formatEntry(r));
                  setOpen(false);
                }}
                className="flex w-full flex-col px-3 py-2 text-left hover:bg-neutral-800"
              >
                <span className="text-xs text-neutral-100">{r.label}</span>
                <span className="text-[10px] text-neutral-500">
                  {[r.division, r.department].filter(Boolean).join(" / ") || "—"}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}