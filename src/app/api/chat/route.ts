import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateText, stepCountIs } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { getAdminWalletFromRequest, getWalletFromRequest } from "@/lib/admin";
import { SYSTEM_PROMPT } from "@/lib/chat/system";
import { buildChatTools } from "@/lib/chat/tools";

export const runtime = "nodejs";
export const maxDuration = 30;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(4000),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(30),
});

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * AI 챗봇 — Gemini(generateText) + 서버 도구(function calling).
 * 인증: x-wallet(로그인 지갑) 필수, x-admin-wallet 있으면 관리자 도구 활성화.
 * 무상태: 대화 이력은 클라이언트가 보내고, 도구는 접속자 기준으로 스코프 처리.
 */
export async function POST(req: NextRequest) {
  try {
    const wallet = getWalletFromRequest(req);
    if (!wallet) {
      return errorResponse("로그인한 사용자만 이용할 수 있습니다. 지갑을 먼저 연결해 주세요.", 401);
    }
    const isAdmin = !!getAdminWalletFromRequest(req);

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      return errorResponse("AI 연동 키(GOOGLE_GENERATIVE_AI_API_KEY)가 설정되지 않았습니다. 서버 관리자에게 문의해 주세요.", 500);
    }

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse("요청 메시지 형식이 올바르지 않습니다", 400);
    }
    const messages = parsed.data.messages;
    if (messages[messages.length - 1].role !== "user") {
      return errorResponse("마지막 메시지는 사용자 메시지여야 합니다", 400);
    }

    const provider = createGoogleGenerativeAI({ apiKey });
    const modelId = process.env.CHAT_MODEL ?? "gemini-2.5-flash";
    const model = provider(modelId);

    const { text } = await generateText({
      model,
      system: SYSTEM_PROMPT,
      messages,
      tools: buildChatTools({ wallet, isAdmin }),
      maxRetries: 1,
      maxOutputTokens: 4000,
      // v6 기본은 stepCountIs(1) — 도구 호출 그 자체(텍스트 없음)가 step1이면
      // 결과가 빈 채 종료됨. 도구 실행 후 최종 답변을 쓰는 스텝까지 허용하고,
      // 과도한 도구 체이닝은 6스텝 상한으로 차단.
      stopWhen: stepCountIs(6),
    });

    return NextResponse.json({ text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    console.error("[chat] AI 응답 실패:", msg);
    return errorResponse(`AI 응답을 생성하지 못했습니다. 다시 시도하거나 담당자에게 문의하세요. (${msg})`, 500);
  }
}