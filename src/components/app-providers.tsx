"use client";

import { type ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
} from "@solana/kit";
import { getEnv, isSolanaMainnet } from "@/lib/config/env";
import { WalletProvider } from "@/lib/wallet/wallet-context";

/**
 * 글로벌 프로바이더 조합.
 * PrivyProvider(Google 로그인 + 임베디드 Solana 지갑) > WalletProvider(어댑터 추상화).
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const env = getEnv();
  const appId = env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) {
    throw new Error("NEXT_PUBLIC_PRIVY_APP_ID 가 설정되어 있지 않습니다");
  }

  const chainId = isSolanaMainnet() ? "solana:mainnet-beta" : "solana:devnet";
  const rpcUrl = env.NEXT_PUBLIC_SOLANA_RPC_URL;
  const wssUrl = rpcUrl.replace(/^http/, "ws");

  return (
    <PrivyProvider
      appId={appId}
      clientId={env.NEXT_PUBLIC_PRIVY_CLIENT_ID || undefined}
      config={{
        loginMethods: ["google"],
        appearance: {
          walletChainType: "solana-only",
        },
        solana: {
          rpcs: {
            [chainId]: {
              rpc: createSolanaRpc(rpcUrl),
              rpcSubscriptions: createSolanaRpcSubscriptions(wssUrl),
            },
          },
        },
        embeddedWallets: {
          solana: {
            createOnLogin: "all-users",
          },
        },
      }}
    >
      <WalletProvider>{children}</WalletProvider>
    </PrivyProvider>
  );
}