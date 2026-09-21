// 챗봇 메뉴 정의 — 각 메뉴는 LLM에 전달할 구체적인 프롬프트(prompt)를 담고,
// 서버 /api/chat 의 도구(function calling)가 실제 데이터로 답변한다.
// LLM이 멤버십 대화를 계속 유지하므로, 메뉴는 "어떤 요청"인지 한 문장으로 명확히 설명한다.

export interface ChatMenu {
  id: string;
  label: string;
  prompt: string;
}

export const CHAT_MENUS: ChatMenu[] = [
  {
    id: "upcoming-tasks",
    label: "앞으로 해야하는 업무내용",
    prompt:
      "월간 리포팅 도구(getMonthlyReport)를 사용해 이번 달 확인 필요 자산과 만기 도래 자산을 조회하고, 그 결과를 근거로 '앞으로 해야 할 업무 목록'을 정리해 줘. ① 확인 필요 자산(퇴직·퇴직예정·신규입사·휴직·파견·자산-근무지 위치 상이)의 권장조치와 ② 만기 도래 자산(D-N·기한 경과)의 반납/연장 대상을 관리번호와 함께 보여줘.",
  },
  {
    id: "idle-recommend",
    label: "유휴 자산 추천",
    prompt:
      "회사에 유휴(재배정 가능)한 자산을 추천해 줘. 유휴 자산(전사 공개) 화면과 동일한 데이터셋(상태=유휴)을 유휴 자산 도구(getIdleAssets)로 조회해서, 카테고리·모델·위치·월 렌탈비를 함께 보여줘.",
  },
  {
    id: "handover-coach",
    label: "이관 인수인계 코치",
    prompt:
      "이관(인수인계) 절차를 안내해 줘. 대상 자산 관리번호를 알려주면 그 자산의 이관 이력과 다음 단계를, 모르면 전반적인 3단계 절차(요청→수신 승인→관리자 승인)와 주의사항을 설명해 줘.",
  },
  {
    id: "faq",
    label: "프로세스/FAQ 안내",
    prompt:
      "Asset-Guard 사용법 프로세스(지갑 연결, 자산 등록, 이관 승인, 월간 리포팅 판단 기준)에 대해 안내해 줘.",
  },
];