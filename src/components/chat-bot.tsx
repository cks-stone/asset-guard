"use client";

import { useEffect, useRef, useState } from "react";
import { CHAT_MENUS, GENERIC_REPLY } from "@/lib/chat/menus";

type ChatRole = "user" | "bot";

interface ChatMessage {
  role: ChatRole;
  text: string;
}

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
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "bot", text: "무엇을 도와드릴까요?" },
  ]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const pushMessages = (userText: string, botText: string) => {
    setInput("");
    setMessages((prev) => [
      ...prev,
      { role: "user", text: userText },
      { role: "bot", text: botText },
    ]);
  };

  const handleMenu = (menu: (typeof CHAT_MENUS)[number]) => {
    pushMessages(menu.label, menu.reply);
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    pushMessages(text, GENERIC_REPLY);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="챗봇 열기"
        className="fixed bottom-5 right-5 z-50 flex h-28 w-28 flex-col items-center justify-center gap-1 rounded-full bg-violet-600 text-white shadow-lg shadow-violet-950/40 transition-colors hover:bg-violet-500"
      >
        <ChatBubbleIcon className="h-12 w-12" />
        <span className="text-sm font-semibold">AI 챗봇</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex w-[min(360px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl shadow-black/50">
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 text-white">
            <ChatBubbleIcon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Asset-Guard 챗봇</p>
            <p className="text-[10px] text-neutral-500">AI 답변 준비 중</p>
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

      <div className="flex max-h-[60vh] flex-1 flex-col overflow-y-auto px-3 py-4">
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
                {m.text}
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
            if (e.key === "Enter") handleSend();
          }}
          placeholder="궁금한 점을 입력하세요"
          className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none placeholder:text-neutral-500 focus:border-violet-500"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim()}
          className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-40"
        >
          보내기
        </button>
      </div>
    </div>
  );
}