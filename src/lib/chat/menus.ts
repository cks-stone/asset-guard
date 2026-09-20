// 챗봇 메뉴 정의 — LLM 연동 이전 단계에서는 메뉴별 고정 안내 문구로 응답한다.
// 이후 AI 연동 시: 이 reply들을 실제 조회/생성 로직(또는 /api/chat 응답)으로 교체하면 된다.

export interface ChatMenu {
  id: string;
  label: string;
  reply: string;
}

export const CHAT_MENUS: ChatMenu[] = [
  {
    id: "upcoming-tasks",
    label: "앞으로 해야하는 업무내용",
    reply:
      "앞으로 해야 하는 업무 조회는 AI 연동이 필요합니다.\n연결되면 담당 자산의 예정 업무·승인 대기·계약 만료 알림을 안내드릴게요.",
  },
  {
    id: "rental-estimate",
    label: "렌탈 예상 견적",
    reply:
      "렌탈 예상 견적 계산은 AI 연동이 필요합니다.\n연결되면 카테고리·기간·수량 기준으로 월별 예상 비용을 안내드릴게요.",
  },
  {
    id: "idle-recommend",
    label: "유휴 자산 추천",
    reply:
      "유휴 자산 추천은 AI 연동이 필요합니다.\n연결되면 부문·비용·기간 기준으로 적합한 유휴 자산을 매칭해 드릴게요.",
  },
  {
    id: "handover-coach",
    label: "이관 인수인계 코치",
    reply:
      "이관 인수인계 안내는 AI 연동이 필요합니다.\n연결되면 현재 담당자·이관 이력·다음 절차를 알려드릴게요.",
  },
  {
    id: "report",
    label: "자동 보고서 생성",
    reply:
      "자동 보고서 생성은 AI 연동이 필요합니다.\n연결되면 이관·비용·만료 이슈를 요약해 드릴게요.",
  },
  {
    id: "onchain-audit",
    label: "온체인 감사 조회",
    reply:
      "온체인 감사 조회는 AI 연동이 필요합니다.\n연결되면 자산 이동 이력과 트랜잭션 검증을 보여드릴게요.",
  },
  {
    id: "nl-search",
    label: "자연어 데이터 탐색",
    reply:
      "자연어 데이터 탐색은 AI 연동이 필요합니다.\n연결되면 조건을 해석해 원하는 자산·비용을 찾아드릴게요.",
  },
  {
    id: "faq",
    label: "프로세스/FAQ 안내",
    reply:
      "프로세스/FAQ 안내는 AI 연동이 필요합니다.\n연결되면 이관 절차·지갑 연결 등의 질문에 답변드릴게요.",
  },
];

export const GENERIC_REPLY =
  "(API 연동이 필요합니다)\n현재는 AI 답변이 준비 중이에요. 곧 연결되면 실시간으로 답변드릴게요.";