import {
  Transaction as LegacyTransaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { isSolanaMainnet } from "@/lib/config/env";
import type { SignedTransaction, WalletAdapter } from "./types";

/**
 * Privy 임베디드 Solana 지갑(v3 ConnectedStandardSolanaWallet) 대상 서명 노출 범위.
 * 전체 타입은 @privy-io/js-sdk-core 의 ConnectedStandardSolanaWallet.
 */
export interface PrivySolanaSigner {
  address: string;
  signTransaction(input: {
    transaction: Uint8Array;
    chain?: string;
  }): Promise<{ signedTransaction: Uint8Array }>;
  signMessage(input: { message: Uint8Array }): Promise<{ signature: Uint8Array }>;
}

export interface PrivyHolder {
  getWallet(): PrivySolanaSigner | null;
}

export interface PrivyAdapterDeps {
  login(): void | Promise<void>;
  logout(): void | Promise<void>;
}

const SOLANA_CHAIN = isSolanaMainnet() ? "solana:mainnet-beta" : "solana:devnet";

function requireWallet(holder: PrivyHolder): PrivySolanaSigner {
  const wallet = holder.getWallet();
  if (!wallet) throw new Error("지갑이 연결되어 있지 않습니다");
  return wallet;
}

function serializeForSigning(tx: SignedTransaction): Uint8Array {
  if (tx instanceof VersionedTransaction) {
    return tx.serialize();
  }
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false });
}

function reviveSigned(
  original: SignedTransaction,
  raw: Uint8Array,
): SignedTransaction {
  if (original instanceof VersionedTransaction) {
    return VersionedTransaction.deserialize(raw);
  }
  return LegacyTransaction.from(raw);
}

/**
 * Privy 임베디드 Solana 지갑용 WalletAdapter.
 * Privy는 로그인 시 지갑이 자동 생성되므로 connect = privy.login(),
 * 서명은 현재 로그인된 임베디드 지갑(holder가 동적으로 참조)으로 수행한다.
 */
export function createPrivyWalletAdapter(
  holder: PrivyHolder,
  deps: PrivyAdapterDeps,
): WalletAdapter {
  return {
    name: "Privy",

    isInstalled: () => true,
    isAvailable: () => true,
    isConnected: () => holder.getWallet() !== null,

    getPublicKey: () => holder.getWallet()?.address ?? null,

    async connect() {
      await deps.login();
      const wallet = holder.getWallet();
      if (!wallet) throw new Error("지갑을 찾을 수 없습니다. 로그인 후 다시 시도하세요.");
      return wallet.address;
    },

    async disconnect() {
      await deps.logout();
    },

    async signTransaction(transaction: SignedTransaction): Promise<SignedTransaction> {
      const wallet = requireWallet(holder);
      const { signedTransaction } = await wallet.signTransaction({
        transaction: serializeForSigning(transaction),
        chain: SOLANA_CHAIN,
      });
      return reviveSigned(transaction, signedTransaction);
    },

    async signAllTransactions(
      transactions: SignedTransaction[],
    ): Promise<SignedTransaction[]> {
      const signed: SignedTransaction[] = [];
      for (const tx of transactions) {
        const wallet = requireWallet(holder);
        const { signedTransaction } = await wallet.signTransaction({
          transaction: serializeForSigning(tx),
          chain: SOLANA_CHAIN,
        });
        signed.push(reviveSigned(tx, signedTransaction));
      }
      return signed;
    },

    async signMessage(message: Uint8Array): Promise<Uint8Array> {
      const wallet = requireWallet(holder);
      const { signature } = await wallet.signMessage({ message });
      return signature;
    },

    onConnect: () => () => {},
    onDisconnect: () => () => {},
    onAccountChanged: () => () => {},
  };
}