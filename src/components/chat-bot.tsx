"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { CHAT_MENUS } from "@/lib/chat/menus";
import { useWallet } from "@/lib/wallet/wallet-context";

type ChatRole = "user" | "bot";

interface ChatMessage {
  role: ChatRole;
  text: string;
  pending?: boolean;
}

const CHAT_MIN_W = 320;
const CHAT_MIN_H = 320;

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

export function ChatBot() {
  const { publicKey } = useWallet();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "bot", text: "무엇을 도와드릴까요?" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  // 패널 가로/세로 크기(px) — 우하단 핸들 드래그로 사용자가 임의 조절 가능.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; w: number; h: number } | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const openChat = () => {
    const maxW = window.innerWidth - 40;
    const maxH = window.innerHeight - 96;
    setSize({
      w: Math.max(CHAT_MIN_W, Math.min(560, maxW)),
      h: Math.max(CHAT_MIN_H, Math.min(Math.round(window.innerHeight * 0.7), maxH)),
    });
    setOpen(true);
  };

  const startResize = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!size) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, w: size.w, h: size.h };
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const maxW = window.innerWidth - 40;
      const maxH = window.innerHeight - 96;
      setSize({
        w: Math.max(CHAT_MIN_W, Math.min(d.w + (ev.clientX - d.startX), maxW)),
        h: Math.max(CHAT_MIN_H, Math.min(d.h + (ev.clientY - d.startY), maxH)),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const pushPending = (userText: string) => {
    setInput("");
    setMessages((prev) => [
      ...prev,
      { role: "user", text: userText },
      { role: "bot", text: "", pending: true },
    ]);
  };

  const replacePending = (botText: string, error = false) => {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last && last.pending) {
        next[next.length - 1] = {
          role: "bot",
          text: error ? `(오류) ${botText}` : botText,
        };
      } else if (error) {
        next.push({ role: "bot", text: `(오류) ${botText}` });
      }
      return next;
    });
  };

  const askAi = async (latestText: string, userText?: string) => {
    if (busyRef.current) return;
    if (!latestText.trim()) return;

    const history = messages
      .filter((m) => !m.pending)
      .map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: m.text,
      }));

    if (!publicKey) {
      pushPending(userText ?? latestText);
      replacePending("지갑을 먼저 연결한 뒤 다시 시도해 주세요.");
      return;
    }

    busyRef.current = true;
    setBusy(true);
    pushPending(userText ?? latestText);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wallet": publicKey },
        body: JSON.stringify({
          messages: [...history, { role: "user" as const, content: latestText }],
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { text?: string; error?: string }
        | null;
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      const reply = (json?.text ?? "").trim();
      if (!reply) throw new Error("응답이 비어 있습니다");
      replacePending(reply);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI 응답을 생성하지 못했습니다.";
      replacePending(`${msg} — 잠시 후 다시 시도해 주세요.`, true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleMenu = (menu: (typeof CHAT_MENUS)[number]) => {
    setInput("");
    void askAi(menu.prompt, menu.label);
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    void askAi(text);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={openChat}
        aria-label="챗봇 열기"
        className="fixed bottom-5 right-5 z-50 flex h-28 w-28 flex-col items-center justify-center gap-1 rounded-full bg-violet-600 text-white shadow-lg shadow-violet-950/40 transition-colors hover:bg-violet-500"
      >
        <ChatBubbleIcon className="h-12 w-12" />
        <span className="text-sm font-semibold">AI 챗봇</span>
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl shadow-black/50"
      style={size ? { width: size.w, height: size.h } : undefined}
    >
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 text-white">
            <ChatBubbleIcon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Asset-Guard 챗봇</p>
            <p className="text-[10px] text-neutral-500">
              {busy ? "답변 생성 중…" : "Gemini 연동"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="닫기"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
        >
          ✕
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4">
        <div className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                  m.role === "user"
                    ? "rounded-br-sm bg-violet-600 text-white"
                    : "rounded-bl-sm border border-neutral-800 bg-neutral-800/60 text-neutral-100"
                }`}
              >
                {m.pending ? (
                  <span className="animate-pulse">답변 작성 중…</span>
                ) : (
                  m.text
                )}
              </div>
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            {CHAT_MENUS.map((menu) => (
              <button
                key={menu.label}
                type="button"
                onClick={() => handleMenu(menu)}
                className="rounded-full border border-violet-500/50 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-200 transition-colors hover:bg-violet-500/20"
              >
                {menu.label}
              </button>
            ))}
          </div>
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-neutral-800 px-3 py-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) handleSend();
          }}
          placeholder="궁금한 점을 입력하세요"
          className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none placeholder:text-neutral-500 focus:border-violet-500"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || busy}
          className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-40"
        >
          보내기
        </button>
      </div>

      <button
        type="button"
        aria-label="챗봇 크기 조절"
        onPointerDown={startResize}
        className="absolute bottom-1 right-1 z-10 flex h-6 w-6 cursor-se-resize touch-none items-center justify-center text-neutral-600 hover:text-violet-400"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M14.5 6.5 6.5 14.5" />
          <path d="M14.5 11.5 11.5 14.5" />
          <path d="M14.5 1.5 1.5 14.5" opacity="0.45" />
        </svg>
      </button>
    </div>
  );
}