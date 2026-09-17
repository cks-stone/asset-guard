"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { PhantomWalletAdapter } from "./phantom";
import { createPrivyWalletAdapter, type PrivySolanaSigner } from "./privy";
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
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets: privyWallets } = useWallets();

  const solanaWallet = useMemo(
    () => (privyWallets[0] as PrivySolanaSigner | null) ?? null,
    [privyWallets],
  );

  // 로그인 상태와 무관하게 "현재" 지갑을 서명 시점에 참조할 수 있도록 보관.
  const holderRef = useRef<PrivySolanaSigner | null>(solanaWallet);
  useEffect(() => {
    holderRef.current = solanaWallet;
  }, [solanaWallet]);

  const adapter = useMemo(
    () => createPrivyWalletAdapter(
      { getWallet: () => holderRef.current },
      { login, logout },
    ),
    [login, logout],
  );

  // 예비 어댑터 — Phantom 확장이 설치되어 있으면 보조로 노출.
  const phantomAdapter = useMemo(() => {
    if (typeof window === "undefined") return null;
    const phantom = new PhantomWalletAdapter();
    return phantom.isInstalled() ? phantom : null;
  }, []);

  const wallets = useMemo(() => {
    const list: WalletAdapter[] = [adapter];
    if (phantomAdapter) list.push(phantomAdapter);
    return list;
  }, [adapter, phantomAdapter]);

  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPublicKey(authenticated && solanaWallet ? solanaWallet.address : null);
  }, [authenticated, solanaWallet]);

  const connect = useCallback(async () => {
    if (!ready) return;
    setConnecting(true);
    setError(null);
    try {
      await login();
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인 실패");
    } finally {
      setConnecting(false);
    }
  }, [ready, login]);

  const connectSilently = useCallback(async () => {
    // Privy 로그인은 사용자 인터랙션(Google 인증)이 필요하므로 자동 연결 없음.
  }, []);

  const disconnect = useCallback(async () => {
    setError(null);
    try {
      await logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그아웃 실패");
    } finally {
      setPublicKey(null);
    }
  }, [logout]);

  const value = useMemo<WalletContextValue>(
    () => ({
      adapter,
      wallets,
      publicKey,
      connected: publicKey !== null && ready,
      connecting,
      error,
      connect,
      connectSilently,
      disconnect,
    }),
    [
      adapter,
      wallets,
      publicKey,
      ready,
      connecting,
      error,
      connect,
      connectSilently,
      disconnect,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet은 <WalletProvider> 안에서 사용해야 합니다");
  return ctx;
}