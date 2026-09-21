"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
  p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  ol: ({ children }) => (
    <ol className="my-1 list-decimal pl-5">{children}</ol>
  ),
  ul: ({ children }) => <ul className="my-1 list-disc pl-5">{children}</ul>,
  li: ({ children }) => <li className="mt-0.5">{children}</li>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-neutral-800/80">{children}</thead>,
  th: ({ children }) => (
    <th className="border border-neutral-700 px-2 py-1 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-neutral-700 px-2 py-1 align-top">{children}</td>
  ),
  code: ({ children }) => (
    <code className="rounded bg-neutral-800 px-1 py-0.5 text-[12px]">
      {children}
    </code>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-violet-300 underline"
    >
      {children}
    </a>
  ),
};

export function ChatMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}