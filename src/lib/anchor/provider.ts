import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { getEnv } from "@/lib/config/env";
import type { SignedTransaction, WalletAdapter } from "@/lib/wallet/types";

/**
 * anchor.AnchorProvider 가 기대하는 Wallet 인터페이스(provider/cjs) 타입.
 * `anchor.Wallet`은 NodeWallet 파생 클래스(무조건 payer 필요)이므로 사용하지 않는다.
 */
type ProviderWallet = ConstructorParameters<typeof anchor.AnchorProvider>[1];

/**
 * WalletAdapter(브라우저 지갑)를 Anchor의 Wallet 인터페이스로 변환하는 shim.
 * Privy embedded 등 다른 어댑터도 동일하게 동작한다.
 */
class AdapterWallet implements ProviderWallet {
  private readonly adapter: WalletAdapter;

  constructor(adapter: WalletAdapter) {
    this.adapter = adapter;
  }

  get publicKey(): PublicKey {
    const pk = this.adapter.getPublicKey();
    if (!pk) throw new Error("지갑이 연결되어 있지 않습니다");
    return new PublicKey(pk);
  }

  async signTransaction<T>(transaction: T): Promise<T> {
    const signed = (await this.adapter.signTransaction(
      transaction as SignedTransaction,
    )) as SignedTransaction;
    return signed as T;
  }

  async signAllTransactions<T>(
    transactions: T[],
  ): Promise<T[]> {
    const signed: SignedTransaction[] = [];
    for (const tx of transactions) {
      signed.push(await this.adapter.signTransaction(tx as SignedTransaction));
    }
    return signed as T[];
  }
}

export function toAnchorWallet(adapter: WalletAdapter): ProviderWallet {
  return new AdapterWallet(adapter);
}

export function getConnection(): Connection {
  const { NEXT_PUBLIC_SOLANA_RPC_URL: rpcUrl } = getEnv();
  return new Connection(rpcUrl, { commitment: "confirmed" });
}

export function createAnchorProvider(
  adapter: WalletAdapter,
): anchor.AnchorProvider {
  return new anchor.AnchorProvider(
    getConnection(),
    toAnchorWallet(adapter),
    { commitment: "confirmed", preflightCommitment: "confirmed" },
  );
}