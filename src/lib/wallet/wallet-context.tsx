"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getWalletAdapters } from "./index";
import type { WalletAdapter } from "./types";

interface WalletContextValue {
  adapter: WalletAdapter | null;
  wallets: WalletAdapter[];
  publicKey: string | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  connect(): Promise<void>;
  connectSilently(): Promise<void>;
  disconnect(): Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallets] = useState<WalletAdapter[]>(() =>
    typeof window === "undefined" ? [] : getWalletAdapters(),
  );
  const adapter = useMemo(() => wallets[0] ?? null, [wallets]);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!adapter) return;
    const offs = [
      adapter.onConnect(() => setPublicKey(adapter.getPublicKey())),
      adapter.onAccountChanged((pk) => setPublicKey(pk)),
      adapter.onDisconnect(() => setPublicKey(null)),
    ];
    return () => offs.forEach((off) => off());
  }, [adapter]);

  useEffect(() => {
    if (adapter?.isConnected()) setPublicKey(adapter.getPublicKey());
  }, [adapter]);

  const connect = useCallback(async () => {
    if (!adapter) {
      setError("Phantom이 설치되어 있지 않습니다");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const pk = await adapter.connect();
      setPublicKey(pk);
    } catch (err) {
      setError(err instanceof Error ? err.message : "지갑 연결 실패");
    } finally {
      setConnecting(false);
    }
  }, [adapter]);

  const connectSilently = useCallback(async () => {
    if (!adapter) return;
    try {
      await adapter.connect({ onlyIfTrusted: true });
      setPublicKey(adapter.getPublicKey());
    } catch {
      // 사용자가 이전에 승인한 적이 없으면 무시
    }
  }, [adapter]);

  const disconnect = useCallback(async () => {
    try {
      await adapter?.disconnect();
    } finally {
      setPublicKey(null);
    }
  }, [adapter]);

  const value = useMemo<WalletContextValue>(
    () => ({
      adapter,
      wallets,
      publicKey,
      connected: publicKey !== null,
      connecting,
      error,
      connect,
      connectSilently,
      disconnect,
    }),
    [adapter, wallets, publicKey, connecting, error, connect, connectSilently, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet은 <WalletProvider> 안에서 사용해야 합니다");
  return ctx;
}