# Asset-Guard 시스템 개요 (Overview)

> **한 줄 소개**: Asset-Guard는 회사가 보유한 **렌탈 장비 자산의 수명주기를 관리**하는
> 솔라나(Solana) 기반 웹 애플리케이션입니다. 지갑 로그인으로 자산을 보호하고,
> 인사 정보와 연동해 매달 체크할 이슈를 자동으로 뽑아내며, 장비가 이동할 때마다
> **조작할 수 없는 블록체인 증적(이관 트랜잭션 서명 + 이벤트 로그)**을 남깁니다.
>
> 관련 문서: [시연 스크립트](./demo_script.md) · [아키텍처](./ARCHITECTURE.md) ·
> [탭별 기능 명세](./TABS_FEATURES.md) · [블록체인 설계](./BLOCKCHAIN_DESIGN.md) · [비용](./COSTS.md)

---

## 1. 프로젝트 배경 — 왜 만드는가

운영·관리를 시작하게 된 실제 문제의식(시연 스크립트 씬 0 참조)은 총 7가지입니다.

| # | 문제의식 | 설명 |
|---|---|---|
| 1 | **렌탈 자산 관리 시스템 없음** | 장비가 몇 대나 어디에 분산돼 있는지 집계할 방법이 없음 |
| 2 | **매년 인사 이동이 많음** | 부서/팀 이동·퇴직·신규입사가 잦아 "이 장비 누가 들고 있는가" 체크 항목이 비대해짐 |
| 3 | **관리자 눈에 안 보이는 자산 이동** | 옆자리로 옮기는 수준의 이동이 장부에 남지 않음 |
| 4 | **사적 사용 리스크** | 회사 자산이 조용히 사라지는 순간을 놓침 |
| 5 | **예산 파악 불가** | 월 렌탈비 총액·부문별 집계본조차 확인 불가 |
| 6 | **연장계약·반납 대응 어려움** | 만기 일정이 한눈에 보이지 않아 놓치기 일쑤 |
| 7 | **조작 불가한 기록 필요** | 인수인계 이력이 뒤집을 수 없는 증거로 남아야 함 |

## 2. 해결 방향 (3가지 축)

1. **지갑 기반 로그인으로 자산 보호** — 모든 자산은 담당자가 Solana 지갑(`managed_by`)에 귀속되고,
   모든 API는 지갑으로 본인을 식별합니다.
2. **인사 연동 자동 리포팅** — 렌탈 자산과 인사 프로필을 외래 키로 연결해,
   매달 "확인 필요 자산(퇴직·신규입사·휴직·파견·위치 상이 등)"과
   "만기 도래 자산(D-N·기한 경과)"을 자동 집계해 권장조치까지 제시합니다.
3. **블록체인 이관 증적** — 이관(인수인계)이 확정되는 순간 서비스 지갑이
   `create_handover` 트랜잭션을 서명·기록합니다. 누가, 언제, 어떤 장비를 넘겼는지가
   삭제·위변조가 어려운 온체인 증거로 남습니다.

## 3. 기술 스택

| 영역 | 스택 |
|---|---|
| 웹 프레임워크 | Next.js 15 (App Router), React 19, Tailwind CSS v4 |
| 지갑 인증 | Privy(Google 로그인 + 임베디드 Solana 지갑), Phantom |
| 온체인 | Solana web3.js v1, Anchor(@coral-xyz/anchor 0.31), @solana/kit |
| 데이터베이스 | Supabase (PostgreSQL, RLS) |
| AI 챗봇 | Vercel AI SDK(`ai`), @ai-sdk/google(Gemini), react-markdown + remark-gfm |
| 검증 | Zod |
| 배포 | Vercel |

## 4. 아키텍처 요약 — "이중 저장"

| 저장 영역 | 대상 | 근거 |
|---|---|---|
| **Supabase (DB)** | 자산 마스터(관리번호·시리얼·모델·렌탈·청구·상태) · 담당자 · 인사 프로필 · 동의 타임스탬프 · 이관 이력(서명 포함) | 질의·수정·리포팅이 필요한 구조적 데이터 |
| **Solana 온체인** | **이관 확정 사실** — 트랜잭션 서명 + `HandoverCreated` 이벤트 로그 | 삭제·변조가 어려운 감사 증적 |

- "결의(동의, off-chain) + 실행 확정(on-chain)" 형태로, 결의(요청·수신 승인)는 DB 타임스탬프,
  확정(관리자 승인)만 온체인에 기록됩니다.
- **무계정(account-less)**: 자산별 PDA 계정을 만들지 않고, **트랜잭션 서명 + 이벤트 로그**만
  온체인 증거로 사용합니다. 자산당 렌트 예치금이 0이 되어 자산·이관 수만큼 잠금이 누적되는
  문제를 없앴습니다(과거 PDA 계정 설계에서 전환).

## 5. 권한 모델

| 구분 | 식별 방식 | 역할 |
|---|---|---|
| 로그인 사용자 | `x-wallet` 헤더(Solana 주소 base58 검증) | 내 담당 자산 조회/등록, 이전 요청·수신 승인, 유휴 자산(전사 공개) 조회, AI 챗봇 |
| 관리자 | `x-admin-wallet` + `ADMIN_WALLETS` 화이트리스트 | 전사 대시보드, 전체 자산 관리, 관리자 승인(온체인 실행), 인사 정보 관리 |
| 서비스 지갑(fee payer) | `FEE_PAYER_SECRET`(서버 전용) | 온체인 트랜잭션 서명·수수료 부담 |

- 일반 사용자는 항상 `managed_by = 내 지갑` 기준으로만 조회됩니다(타인 자산 상세·이관 이력은
  인수인계 수신 예정일 때만).

## 6. 주요 기능 (데모 씬 순서)

### 6-1. 지갑 로그인 + 내 정보 등록
- Solana 지갑으로 로그인 → 내 이름·부문·팀을 등록하면 **지갑 디렉토리**에 노출됩니다.
  디렉토리는 이후 장비를 넘겨줄 상대를 찾을 때 사용합니다.

### 6-2. 대시보드 (일반)
- **통계 카드 5종**: 총 렌탈 자산 / 정상사용 / 유휴 / 이전 진행 / N월 렌탈비 합계 (내 자산 기준, 계약종료 제외).
- **청구 달력**: 1년 단위 렌탈비 월 합계 달력 뷰.
- **월간 리포팅**: ① 확인 필요 자산(퇴직·퇴직예정·신규입사·휴직·파견·자산-근무지 위치 상이 등, 권장조치 제시)
  + ② 만기 도래 자산(계약 종료 3개월 이내 또는 기한 경과, `D-N`/기간 경과 배지).
- 공통: 10초 주기 폴링 + 포커스 복귀 시 재조회, 변경된 행만 `applyDiff`로 5초 하이라이트.

### 6-3. 전사 대시보드 (관리자)
- 전체 자산(계약종료 포함) 기준 통계·청구 달력·월간 리포팅(scope=all).

### 6-4. 내가 관리하고 있는 자산목록
- **내 담당 자산 + 내게 이전 요청이 온 인입 자산** 동시 표시.
- 사용자는 **등록된 인사 프로필에서만 select** (인사 먼저 → 자산 그 후, 외래 키 0016).
- 필터(상태·카테고리·부문/팀·장소·렌탈사) 조합 검색, [+자산등록] 모달.
- 진행 배지: `↦ 주소`(amber) → `수신자 승인 대기`(blue) → `관리자 승인 대기`(amber) → 인수·거절(red).

### 6-5. 인수인계 3단계 (핵심 플로우)
1. **담당자 요청** → `pending_to_wallet = B` (정상사용 상태만 가능, 중복·본인 전달 차단)
2. **수신자 인수 승인/거절** → `pending_receiver_approved_at / _rejected_at`
3. **관리자 최종 승인** → 서비스 지갑이 `create_handover`를 온체인 실행 →
   성공 시에만 `managed_by`가 B로 이전되고 이관 이력 기록
- 확정 전 어느 단계에서든 담당자가 [취소] 가능(흔적 없음). 수신자 거절·관리자 거절은 사유 타임스탬프를 남깁니다.
- 일괄 승인(배치): 최대 **6건** 단위로 한 트랜잭션 처리, 실패 시 개별 폴백으로 부분 성공 보장.

### 6-6. 이관 그래프 (ReactFlow)
- 자산별 이관 이력을 다이아몬드 트리로 시각화. 각 연결선에 **온체인 트랜잭션 서명·시각** 표시
  (온체인 감사 조회).

### 6-7. 유휴 자산(전사)
- 상태=유휴인 회사 전체 자산을 로그인 사용자 모두 조회하는 **전사 공개 목록** —
  유휴 장비 재배정(인수 배정) 검토용.

### 6-8. 관리자 렌탈 자산 관리
- 전체 자산 인라인 수정(PATCH): 카테고리·사용자(인사 select)·부문/팀·위치·렌탈료·기간·상태.
- 배치 **승인/거절**: 체크박스 선택 → 배치 바에서 일괄 처리, 결과는 자산별 성공/실패/제외.
- 진행 중 이전 자산을 최상단 정렬, 넓은 테이블 가로 스크롤.

### 6-9. 인사 정보 관리 (관리자)
- `employee_profiles` 기준: 인사상태·근무위치·부문/팀(select)·직급·입사일·퇴직(예정)일 관리.
- **월간 리포팅 판단 기준이 되는 단일 진실원천** — 인사 정보를 바꾸면 다음 리포팅 권장조치가 즉시 바뀝니다.
- 0016 FK: 자산의 `user_name`이 이 프로필을 참조하므로 프로필 선행 등록 필요.

### 6-10. AI 챗봇 (우하단, 전 화면 공통)
- `POST /api/chat` — Gemini(**function calling**)가 실제 데이터를 조회해 한국어로 답변합니다.
  - 기본 모델 `gemini-2.5-flash`(`CHAT_MODEL`로 오버라이드), 키는 `GOOGLE_GENERATIVE_AI_API_KEY`.
  - **현재 시점 주입**: 시스템 프롬프트에 KST 오늘 날짜를 실어 "이번 달·기준 시점·D-N" 판단이
    모델 지식 날짜(예: 2024년)가 아닌 실제 오늘(예: 2026-09-21) 기준이 되도록 합니다.
  - **멀티스텝**: `stopWhen: stepCountIs(6)` — 도구 호출 후 최종 답변을 쓰는 스텝까지 루프 허용
    (v6 기본은 1스텝이라 도구-전용 응답이 빈 텍스트가 되는 문제 해결).
- **메뉴 4종** (`src/lib/chat/menus.ts`):

  | 메뉴 | 주요 도구 |
  |---|---|
  | 앞으로 해야하는 업무내용 | `getMonthlyReport` — 월간 리포팅(업무 목록 정리) |
  | 유휴 자산 추천 | `getIdleAssets` — 전사 유휴 데이터셋과 동일 |
  | 이관 인수인계 코치 | `getAssetDetail` · `getTransferHistory` · `getWalletContacts` |
  | 프로세스/FAQ 안내 | (시스템 프롬프트 기반) |
- **서버 도구 11종** (`src/lib/chat/tools.ts`): `getMyAssetOverview` · `getPendingTransfers` ·
  `getExpiringAssets` · `getIdleAssets` · `getAssetDetail` · `getTransferHistory` ·
  `getMonthlyReport` · `getWalletContacts` · (관리자) `getCorpOverview` ·
  `getPendingAdminApprovals` · `getHrProfiles`
- **마크다운 렌더링**: 봇 말풍선을 react-markdown으로 렌더링해 `**` 진하게·목록·표·링크가
  실제 UI에 표시됩니다(raw HTML은 이스케이프로 안전).
- 월간 리포팅 판단 로직은 `/api/monthly-report`와 공유하는 단일 구현(`src/lib/monthly-report/core.ts`).

## 7. 데이터 모델 (Supabase)

- `rental_assets` — 자산 마스터. `managed_by`(담당 지갑, `wallet_labels` FK) ·
  `user_name`(사용자, `employee_profiles` FK) · `status`(정상사용/유휴/계약종료) ·
  카테고리·위치·렌탈·청구 · 이전/승인 관련 `pending_*` 컬럼 · `transfer_tx`/`transferred_at`
- `wallet_labels` — 지갑별 프로필(부문·팀), 디렉토리 인덱스
- `transfer_history` — 이관 이력 `(management_no → rental_assets, from/to_wallet → wallet_labels)`
- `employee_profiles` — 인사 프로필 (PK `user_name`, 부문/팀/근무위치/직급/입·퇴사일)

> **FK 연결 (마이그레이션 0016)**: `employee_profiles ─ rental_assets ─ transfer_history ─ wallet_labels`
> 전부 외래 키로 연결. `NOT VALID` 방식으로 기존 데이터는 유지하고 신규 쓰기부터 강제
> (자산 등록 시 미등록 인사·담당 지갑 처리 규칙 적용).

## 8. 블록체인 설계 요지

- **인증**: 사용자 `x-wallet` / 관리자 `x-admin-wallet` + `ADMIN_WALLETS` 화이트리스트.
- **실행**: 서비스 지갑(`FEE_PAYER_SECRET`)만 서명 → 브라우저 미노출, `server-only`.
- **프로그램**: `create_handover(asset_id, asset_code)` — 입력 검증(길이 ≤64, `from≠to`, `InvalidInput`/`SameParty`) 후
  `HandoverCreated { asset_id, asset_code, from, to, created_ts }` **이벤트만** 발행, 상태 저장 없음.
- **멱등성**: DB 소유권 이전을 **조건부 업데이트**(`managed_by==A` AND `pending_to_wallet==B`)로 수행해
  중복 요청이 와도 두 번째는 스킵되고 "이미 완료"로 처리됩니다.
- **명시적 한계**: 온체인 서명 주체는 항상 서비스 지갑 — 체인은 "관리자 승인으로 실행됐다"는
  **실행 사실의 무결성**만 보장하며, 사용자 개인 지갑 서명 검증(예: nonce+personal_sign)은
  후속 작업으로 남아 있습니다. 토큰화(NFT/SPL)도 미구현입니다.

## 9. 환경변수 요약

- **브라우저**: `NEXT_PUBLIC_SOLANA_NETWORK` · `NEXT_PUBLIC_SOLANA_RPC_URL` ·
  `NEXT_PUBLIC_ASSET_GUARD_PROGRAM_ID` · `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` ·
  `NEXT_PUBLIC_PRIVY_APP_ID/CLIENT_ID` · `NEXT_PUBLIC_FEE_PAYER_ADDRESS`
- **서버 전용**: `SUPABASE_SERVICE_ROLE_KEY` · `ADMIN_WALLETS` · `FEE_PAYER_SECRET` ·
  `GOOGLE_GENERATIVE_AI_API_KEY` · `CHAT_MODEL`
- 정의 스키마: `src/lib/config/env.ts`(Zod 검증) · 입력 예시: 루트 `.env.example`

## 10. 문제의식 ↔ 해결 기능 대조표

| # | 문제의식 | 해결 기능 |
|---|---|---|
| 1 | 관리 시스템 없음 | 내 자산 목록 조회·등록, 전사 대시보드 집계 |
| 2 | 인사 이동 다수 | 인사 정보 관리 + 월간 리포팅 "확인 필요 자산" 자동 생성 |
| 3 | 안 보이는 자산 이동 | 이전 요청 3단계(요청→수신 승인→관리자 승인) + 이관 그래프 |
| 4 | 사적 사용 리스크 | 담당 지갑 기반 소유권 추적, 이관 이력/온체인 증적 |
| 5 | 예산 파악 불가 | 대시보드·전사 대시보드 렌탈비 합계 카드 + 청구 달력 |
| 6 | 연장계약 대응 필요 | 월간 리포팅 "만기 도래 자산"(D-N / 기한 경과 배지) |
| 7 | 조작 불가 기록 | `create_handover` 트랜잭션 서명 + `HandoverCreated` 이벤트 로그(무계정) |
| 8 | 매달 체크 업무 많음 | AI 챗봇 "앞으로 해야하는 업무내용"(월간 리포팅 기준 정리) |