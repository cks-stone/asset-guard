import type { Transaction, VersionedTransaction } from "@solana/web3.js";

type PhantomPublicKey = {
  toString(): string;
  toBytes(): Uint8Array;
};

declare global {
  interface Window {
    phantom?: {
      solana?: PhantomInjectedApi;
    };
  }
}

/**
 * Phantom injected API(window.phantom.solana)의 최소 타입.
 * signTransaction 은 구현에 따라 같은 객체를 반환하거나 Uint8Array 를 반환할 수 있다.
 */
export interface PhantomInjectedApi {
  isPhantom?: boolean;
  isConnected: boolean;
  publicKey: PhantomPublicKey | null;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{
    publicKey: PhantomPublicKey;
  }>;
  disconnect(): Promise<void>;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(
    txs: T[],
  ): Promise<T[]>;
  signMessage(message: Uint8Array): Promise<{ signature: Uint8Array }>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
}

export {};