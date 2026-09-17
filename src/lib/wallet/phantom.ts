import {
  Transaction as LegacyTransaction,
  VersionedTransaction as LegacyVersionedTransaction,
} from "@solana/web3.js";
import type { PhantomInjectedApi } from "./phantom-api";
import type { SignedTransaction, WalletAdapter } from "./types";

function getInjectedApi(): PhantomInjectedApi | null {
  if (typeof window === "undefined" || !window.phantom?.solana) return null;
  return window.phantom.solana;
}

function reviveSigned(
  original: SignedTransaction,
  raw: Uint8Array,
): SignedTransaction {
  if (original instanceof LegacyVersionedTransaction) {
    return LegacyVersionedTransaction.deserialize(raw);
  }
  return LegacyTransaction.from(raw);
}

/**
 * 내장 지갑(window.phantom.solana) 어댑터.
 * Privy embedded 도입 시 동일한 WalletAdapter 를 구현하는 어댑터만 추가하면 된다.
 */
export class PhantomWalletAdapter implements WalletAdapter {
  readonly name = "Phantom";

  private readonly api: PhantomInjectedApi | null;
  private readonly listen = new Map<string, Set<(...args: unknown[]) => void>>();

  constructor() {
    this.api = getInjectedApi();
    this.bindEvents();
  }

  isInstalled(): boolean {
    return this.api !== null;
  }

  isAvailable(): boolean {
    return this.isInstalled();
  }

  isConnected(): boolean {
    return this.api?.isConnected ?? false;
  }

  getPublicKey(): string | null {
    if (!this.api?.publicKey) return null;
    return this.api.publicKey.toString();
  }

  async connect(options?: { onlyIfTrusted?: boolean }): Promise<string> {
    if (!this.api) throw new Error("Phantom이 설치되어 있지 않습니다");
    const res = await this.api.connect(options ?? {});
    return res.publicKey.toString();
  }

  async disconnect(): Promise<void> {
    await this.api?.disconnect();
  }

  async signTransaction(transaction: SignedTransaction): Promise<SignedTransaction> {
    if (!this.api) throw new Error("Phantom이 설치되어 있지 않습니다");
    const signed = await this.api.signTransaction(transaction);
    if (signed instanceof Uint8Array) return reviveSigned(transaction, signed);
    return signed;
  }

  async signAllTransactions(
    transactions: SignedTransaction[],
  ): Promise<SignedTransaction[]> {
    if (!this.api) throw new Error("Phantom이 설치되어 있지 않습니다");
    const signedList = await this.api.signAllTransactions(transactions);
    return signedList.map((signed, i) =>
      signed instanceof Uint8Array ? reviveSigned(transactions[i], signed) : signed,
    );
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (!this.api) throw new Error("Phantom이 설치되어 있지 않습니다");
    const res = await this.api.signMessage(message);
    return res.signature;
  }

  onConnect(handler: () => void): () => void {
    return this.subscribe("connect", handler);
  }

  onDisconnect(handler: () => void): () => void {
    return this.subscribe("disconnect", handler);
  }

  onAccountChanged(handler: (publicKey: string | null) => void): () => void {
    return this.subscribe("accountChanged", (...args) => {
      const pk = args[0] as { toString(): string } | null;
      handler(pk ? pk.toString() : null);
    });
  }

  private subscribe(event: string, handler: (...args: unknown[]) => void) {
    const handlers = this.listen.get(event) ?? new Set();
    handlers.add(handler);
    this.listen.set(event, handlers);
    return () => {
      handlers.delete(handler);
    };
  }

  private emit(event: string, ...args: unknown[]) {
    this.listen.get(event)?.forEach((h) => h(...args));
  }

  private bindEvents() {
    if (!this.api) return;
    this.api.on("connect", (...args) => this.emit("connect", ...args));
    this.api.on("disconnect", (...args) => this.emit("disconnect", ...args));
    this.api.on("accountChanged", (...args) => this.emit("accountChanged", ...args));
  }
}