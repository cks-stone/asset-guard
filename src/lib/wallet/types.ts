import type { Transaction, VersionedTransaction } from "@solana/web3.js";

export type SignedTransaction = Transaction | VersionedTransaction;

/**
 * 지갑 프로바이더 추상화.
 * Phantom(내장)과 Privy embedded(추후 어댑터 추가) 등 여러 프로바이더를
 * 동일한 인터페이스로 바꿔 끼울 수 있도록 정의한다.
 */
export interface WalletAdapter {
  readonly name: string;

  isInstalled(): boolean;
  isAvailable(): boolean;
  isConnected(): boolean;
  getPublicKey(): string | null;

  connect(options?: { onlyIfTrusted?: boolean }): Promise<string>;
  disconnect(): Promise<void>;

  signTransaction(transaction: SignedTransaction): Promise<SignedTransaction>;
  signAllTransactions(
    transactions: SignedTransaction[],
  ): Promise<SignedTransaction[]>;
  signMessage(message: Uint8Array): Promise<Uint8Array>;

  onConnect(handler: () => void): () => void;
  onDisconnect(handler: () => void): () => void;
  onAccountChanged(handler: (publicKey: string | null) => void): () => void;
}