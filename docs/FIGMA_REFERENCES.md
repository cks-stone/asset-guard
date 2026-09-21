# Asset-Guard — Figma 레퍼런스 (A~D)

> 이 문서는 `docs/ARCHITECTURE.md`, `docs/BLOCKCHAIN_WHITEPAPER.md`, `docs/TABS_FEATURES.md`와 함께,
> **Figma(디자인/프로토타입) 및 FigJam(플로우/다이어그램) 작업을 위한 참고 스펙**입니다.
> 모든 내용은 실제 구현 컴포넌트(`src/components/*`, Tailwind v4)와 데이터 모델을 기준으로 작성했습니다.
>
> - Figma: A(디자인 시스템) → B(화면 목업) 순으로 구성하면 피그마 프레임이 완성됩니다.
> - FigJam: C(플로우) → D(아키텍처)는 공유용 다이어그램으로 제작하기 좋습니다.

---

# A. 디자인 시스템

## A1. 컬러 토큰

전체 다크 테마. 배경 `neutral-950/900`, 카드 `neutral-900`, 보더 `neutral-700/800`. 모든 색은 Tailwind v4 기본 팔레트 헥스값.

### 기본 / 배경
| 토큰 | Hex | 용도 |
|---|---|---|
| neutral-950 | `#0a0a0a` | 페이지/필터바 백그라운드 |
| neutral-900 | `#171717` | 카드·섹션 배경 |
| neutral-800 | `#262626` | 입력 배경, 행 구분선(`/70`) |
| neutral-700 | `#404040` | 보더(입력·버튼), 헤더 하단선 |
| neutral-600 | `#525252` | 비활성 텍스트, 구분 |
| neutral-500 | `#737373` | 보조 텍스트(설명·레이블) |
| neutral-300 | `#d4d4d4` | 정보 텍스트 |
| neutral-200 | `#e5e5e5` | 기본 본문 텍스트 |
| neutral-100/50 | `#f5f5f5`/`#fafafa` | 강조 본문/합계 |

### 브랜드 / 액션
| 토큰 | Hex | 용도 |
|---|---|---|
| violet-600 | `#7c3aed` | **주 액션** (연결/요청/활성 탭/연도 선택/현재월) |
| violet-500 | `#8b5cf6` | hover, 포커스 보더(`focus:border-violet-500`) |
| violet-300/400 | `#c4b5fd`/`#a78bfa` | 강조 텍스트(합계), 현재월 하이라이트 보더 |
| violet-200 | `#ddd6fe` | 현재월 셀 텍스트 |

### 상태 색 (시맨틱)
| 의미 | 토큰·Hex | 사용처 |
|---|---|---|
| 정상사용 | emerald-500 `#10b981` / emerald-300 `#6ee7b7` | 상태 배지, 인수 승인 버튼, 연결 점(emerald-400 `#34d399`) |
| 유휴 | sky-500 `#0ea5e9` / sky-300 `#7dd3fc` | 유휴 배지, 인사 미입력(렌탈리스트) 배지 |
| 진행/예고 | amber-500 `#f59e0b` / amber-300 `#fcd34d` | 이전 진행, 만기 예정, 배치 바 |
| 기한경과/거절/오류 | red-500 `#ef4444` / red-300 `#fca5a5` / red-600 `#dc2626` | 기한경과 강조, 인수 거절, 로그아웃·거절 버튼, 오류 배너 |
| 퇴직예정 | orange-500 `#f97316` / orange-300 `#fdba74` | 퇴직(전근) 예정 배지 |
| 파견·위치상이 | violet-500/15 / violet-300 | 파견 근무, 자산-근무지 위치 상이 |
| 수습 | cyan-500 `#06b6d4` / cyan-300 `#67e8f9` | 수습 배지 |
| 합계/링크 | blue-400 `#60a5fa` / blue-300 `#93c5fd` | "이관 그래프 ↗" 링크, 렌탈비 합계 |
| 계약종료 | neutral-500/15 / neutral-400 | 계약종료 배지 |

### 배경 배너
- 오류: `bg-red-950/60 text-red-300`
- 성공(안내): `bg-emerald-950/60 text-emerald-300`
- 배치 바: `bg-amber-950/20 border-amber-500/30`

## A2. 타이포그래피

| 용도 | 스타일 |
|---|---|
| 화면 제목 (h2) | 18px (`text-lg`) semibold `#f5f5f5` |
| 통계 카드 숫자 | 24px (`text-2xl`) bold + 상태색 |
| 본문/테이블 | 14px (`text-sm`) |
| 테이블 헤더 | 12px (`text-xs`) medium `neutral-500` |
| 보조 라벨/인용 | 10px (`text-[10px]`) `neutral-500` |
| 금액·단가 | 11~14px mono(`font-mono`) |
| 지갑 주소/관리번호 | mono(`font-mono`), 10~12px(보통 6자+…+4자 축약) |

폰트 패밀리: 본문 Sans(기본), 주소·관리번호·금액 = 모노스페이스. 그리드 본문은 `#f5f5f5`.

## A3. 배지 시스템 (재사용 규칙)

패턴: `rounded px-2 py-0.5 text-xs bg-{c}-500/15 text-{c}-300` (아주 작은 건 `text-[10px]`/`text-[11px]`).

| 배지 | 색 | 예 |
|---|---|---|
| 상태 | emerald(정상사용) / sky(유휴) / neutral(계약종료) | 자산 상태 칩 |
| 사유 (REASON_BADGE) | red(퇴직) / orange(퇴직예정) / emerald(신규입사) / amber(휴직·출산·육아) / violet(파견·위치상이) / cyan(수습) / neutral(기타) | 월간 리포팅 |
| 기간 경과 | red (굵게) | 만기 도래 `기간 경과` |
| D-N / N일 남음 | amber(예정) — `D-7`, `14일 남음` | 만기·퇴직 예정 |
| 인사 출처 | sky(렌탈리스트 인수 대기) / emerald(입력됨) | 인사 정보 관리 |
| 카테고리 칩 | neutral-700/40 | 자산 카테고리 |

## A4. 핵심 컴포넌트

### 카드/섹션
- 섹션: `rounded-xl border border-neutral-800 bg-neutral-900 p-6`
- 통계 카드: `rounded-xl border border-neutral-800 bg-neutral-900 p-4` (5개 그리드 `grid-cols-2 sm:grid-cols-5`, gap 12px)
- 콘텐츠 영역: 높이 제한 없음, 폭 `max-w`는 화면별 다름(A5 참조)

### 버튼
- Primary: `rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white hover:bg-violet-500 disabled:opacity-50`
- 실행(승인): `bg-emerald-600 ... hover:bg-emerald-500`
- 위험(거절/로그아웃): `bg-red-600/80 ... hover:bg-red-500`
- Secondary(검색 등): `bg-neutral-700 hover:bg-neutral-600`
- Outline(필터 계열/연도/탭스): `border border-neutral-700 text-neutral-300 hover:bg-neutral-800`
- 아주 작음: `text-xs px-2 py-1` / `text-[10px] px-2 py-0.5`

### 입력 필드 (인라인/폼 공용)
`rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-violet-500`
- 포커스 시 보더 violet.
- 필터 필드 라벨: 캡션 10px 위, 컨트롤 아래 (`flex flex-col gap-1`).

### 테이블
- 헤더 행: `border-b border-neutral-700 text-xs text-neutral-500`
- 데이터 행: `border-b border-neutral-800/70 align-middle`
- **가로 스크롤**: 부모 `overflow-x-auto` + 테이블 `min-w-*` (화면별 아래 B에 명시)
- 관리번호/금액/주소 열: `font-mono text-xs`
- 변경 행 플래시: 5초 `row-blink` 하이라이트 (diff 동기화 피드백)

### 모달 (자산 등록)
- 오버레이: `fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4`
- 패널: `max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-900 p-6`
- 좌상단 타이틀 + 우상단 ✕ 원형 버튼(`h-7 w-7 rounded-full border border-neutral-700`)
- 폼 그리드: `grid grid-cols-2 gap-3 sm:grid-cols-3`
- 입력 스타일: `rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm` + `*`필수 표시
- 하단 제출: Primary + 취소 Outline

### 선택 바 / 배치 바 (관리자)
`rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2` — [전체 선택/해제] [N건 선택됨] [선택 N건 승인] [선택 N건 거절] + 안내 캡션.

### 탭 네비게이션 (대시보드 좌측)
- 활성: `bg-violet-600 text-white rounded-lg px-3 py-2 text-left text-sm font-medium whitespace-nowrap`
- 비활성: `text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200`
- 데스크톱: 세로 컬럼 `lg:w-56 lg:flex-col` / 모바일: 가로 스크롤 행.

### 지갑 상태 헤더 (WalletStatus)
- 비연결: Primary "지갑 연결" 버튼.
- 연결됨: `flex items-center gap-2 rounded-lg border border-neutral-700 px-3 py-1.5` — 초록 점(4px) · 이름(label, max-w 7rem truncate) · 주소(mono xs) · `▼`.
- 확장 팝업 (우측 정렬, `w-[26rem] rounded-xl border-neutral-700 bg-neutral-900 p-4 shadow-xl z-30`):
  내 프로필(로고아웃 버튼) · 네트워크(Mainnet/Devnet, mono) · 결제 지갑 SOL(관리자, mono, 조회 중…) · 로그인(Google 이메일) · 프로바이더 · 내 정보(라벨·부문/팀 + [수정/등록]) · 지갑 주소(full, mono, [복사]) — 항목은 구분선 `border-t border-neutral-800 pt-2`으로 나눔.

## A5. 여백 / 레이아웃 규칙

- 컴포넌트 간격: `space-y-6`(24px 수직), `gap-3`(12px) / `gap-2`(8px) / `gap-1`.
- 전체 폭: `max-w-[2480px]`(대시보드, 좌측 탭 224px 포함) / 관리자 콘솔 `max-w-[2240px]` / HR `max-w-[1400px]`.
- 섹션 헤더: 타이틀(18px) + 우측 컨트롤(검색/버튼) `flex flex-wrap items-center justify-between gap-3`.
- [대시보드] 데스크톱: `flex flex-col gap-6 lg:flex-row` — 좌측 탭(+ router) + 콘텐츠 `min-w-0 flex-1 space-y-6`.
- 카드 순서: 대시보드 = 통계카드 → 청구달력 → 월간리포팅.

---

# B. 화면 목업 명세 (Figma 화면 7종)

각 화면에 **[프레임 크기][구성 큐] [테이블 컬럼] [주의점]**만 명시. 실제 화면은 A의 컴포넌트로 조립.

## B1. 대시보드 (overview) — 전체 사용자
- 큐: [통계카드 5종] → [청구달력] → [월간리포팅(scope=mine)]
- 통계 카드 5종 (라벨/값/색): 총 렌탈 자산(neutral-200) · 정상사용(emerald-300) · 유휴(sky-300) · 이전 진행(amber-300) · N월 렌탈비 합계(blue-300, `₩1,234,000` 형식).
  - → "이전 진행" = 내게 온 이전 + 내가 보낸 진행 중(수신자 미결의) 수.
- **청구달력**: 연도 버튼 그룹(violet 활성) → 테이블 `min-w-[1200px]`
  - 컬럼: 자산(관리번호 mono + 모델명) · 1월~12월(각 `min-w-76px`) · 합계.
  - 셀: 납부 금액 mono(우측), 0원이면 `—`, 계약 종료 후 연도면 `만기`(amber), **현재 월 컬럼** = violet 보더/50%/10% 배경 하이라이트.
  - 하단 합계 행(중간 `border-t-2 border-neutral-600 bg-neutral-800/40`): 월별 합계 + `₩총합계`(amber-300).
- **월간리포팅**: 상단 [◀] [YYYY년 MM월] [▶] 컨트롤 + 하단 두 테이블.
  - 헤더 설명: "내가 관리하는 자산 기준 — 인사상태·근무위치로 확인이 필요한 자산과 만기(계약 종료) 도래 자산…"

### B1-1. 월간리포팅 ① 확인 필요 자산
- 컬럼: 사유(배지) · 관리번호(mono+이관그래프링크) · 모델명 · 사용자 · 부문/팀 · 자산위치 · 인사상태 · 근무위치 · 입사일 · 퇴직(예정)일(+`N일 남음` amber 배지) · 권장조치.
- 사유 배지 색은 A3 표 참조. 정렬: 관리번호 내림차순.
- 사유 = 퇴직 / 퇴직(전근)예정 / 신규 입사 / 휴직·출산휴가·육아휴직 / 파견 근무 / **자산-근무지 위치 상이**(자산위치≠근무위치, violet) / 수습 / 기타. (위치 판정 로직은 C4 참조)

### B1-2. 월간리포팅 ② 만기 도래 자산
- 컬럼: 관리번호 · 모델명 · 카테고리 · 사용자 · 부문/팀 · 자산위치 · 렌탈 종료일 · 남은 기간(`D-N` / `기간 경과` red) · 권장조치.
- 조치: 기한 경과 → **"반납·연장 대책 필요 (기한 경과)"** red 강조 / 이내 → "재계약(연장)·반납 검토" + `D-N` 배지.
- 정렬: 종료일 오름차순.

## B2. 전사 대시보드 (corp) — 관리자 전용
- 큐: [통계카드 5종(전사 기준, 계약종료 포함)] → [청구달력(계약종료 제외)] → [월간리포팅(scope=all)].
- B1과 동일 렌아웃. 설명 문구만 "전사 전체 자산 기준…". "이전 진행" = 전사 모든 진행 중 이전 요청 수.

## B3. 내가 관리하고 있는 자산목록 (my) — 전체 사용자
- 상단: 제목 + [자산 등록] Primary 버튼 → [AssetFilterBar] → **두 테이블 영역**.
- AssetFilterBar(`flex flex-wrap items-end gap-x-4 gap-y-3`, 라벨 10px): 관리번호(폭 176px) · 시리얼(w36) · 사용자(w28) · 카테고리(select) · 모델명(w28) · 제조사(w24) · 부문(w24) · 팀(w24) · 렌탈사(w24) · 청구(select 월납/연납/반기납/일시납) · 렌탈료(min~max) · 시작일(~) · 종료일(~) · 상태(select) + [초기화].
- 리스트 테이블 `min-w-[1220px]` 컬럼: 관리번호(+이관 그래프 ↗ 링크) · 카테고리(neutral 칩) · 모델명 · 제조사 · 사용자 · 부문/팀 · 자산위치 · 렌탈사 · 청구 · 렌탈료 · 렌탈 시작일 · 렌탈 종료일 · 상태(배지) · 인수인계(액션).
- **정렬 규칙**: 이전 흐름에 관여된(내게 온/내가 요청한) 자산 최상단.
- **인수인계 액션 셀 상태**:
  - 일반: [WalletDirectoryPicker(지갑 선택 입력)] + [이전 요청] violet 버튼
  - 내가 요청·미결의: `수신자 승인 대기` 배지 + [취소]
  - 수신자 승인 완료: `↦ … 승인 완료` 표시
  - 인입(내게 요청): `내게 이전 요청` 배지 + [인수 승인]/[거절]
  - 거절됨: `이전 요청 거절됨` red 배지
- **자산 등록 모달** (A4 모달): 입력 — 관리번호* · 시리얼 · 모델명* · 카테고리(select) · 제조사 · 사용자 · 부문/팀 · 자산위치(예: B-XX지사) · 렌탈사 · 청구(select) · 렌탈료(숫자) · 청구월 · 시작일 · 종료일 · 상태. 하단 [등록 완료]/[취소].

## B4. 유휴 자산(전사) (idle) — 전체 사용자 공개
- 큐: 제목 "유휴 자산 (전사 공개)" + 설명 → AssetFilterBar → 테이블 `min-w-[1100px]`.
- 컬럼: 관리번호 · 카테고리 · 모델명 · 제조사 · 사용자 · 부문/팀 · 자산위치 · 렌탈사 · 청구 · 렌탈료 · 렌탈 시작일 · 렌탈 종료일.
- 상태는 유휴만(전사 노출). 재구성이 잦아 diff 플래시 없이 10초 폴링 갱신.

## B5. 관리자 렌탈 자산 관리 (admin) — 관리자 전용
- 외곽 폭 `max-w-[2240px]`. 큐: [배치 바(있을 때)] → [AssetFilterBar] → 테이블 `min-w-[2000px]` (열 폭은 아래).
- **배치 바** (진행 요청 존재 시): [전체 선택/해제] [이전 요청 N건 중 M건 선택] [선택 M건 승인(emerald)] [선택 M건 거절(red)] + 캡션 "승인… 한 트랜잭션에 묶어 수수료 절감".
- 테이블 컬럼 (min-width): 선택(체크박스) · 관리번호`7rem`(+이관그래프) · 카테고리`7rem`(select) · 모델명`12rem`(읽기) · **사용자`8rem`(인사 select)** · 부문`8rem`(input) · 팀`9rem`(input) · 자산위치`8rem`(input) · 렌탈사`10rem`(읽기) · 렌탈료`7rem`(숫자 input) · 시작일`9rem`(date) · 종료일`9rem`(date) · 상태`7rem`(select) · 이전 요청`14rem`(배지+액션) · 이관 기록`10rem`.
- **사용자 select**: 옵션 = 인사 정보 관리 목록(`/api/employees`) 사람들 + `—`(비움). 현재 값이 목록 밖이면 대비 보완 옵션. **분/팀은 인사 선택 시 자동 동기화**.
- **이전 요청 셀 배지**: 수신자 인수 거절(red) / 수신자 승인 대기(amber) / 수신자 승인(emerald) … + [단건 승인/거절] 또는 배치 대상 체크.
- **이관 기록**: `transfer_tx` mono 축약 + [이관 그래프 ↗] 링크 / 없으면 `—`.
- 정렬: 진행 중 이전(승인대기→수신자승인) 최상단, 이후 관리번호 내림차순.
- 편집 후행은 PATCH로 즉시 저장, row 플래시(5초) 피드백.

## B6. 인사 정보 관리 (hr) — 관리자 전용
- 외곽 폭 `max-w-[1400px]`. 큐: [제목+검색(이름/부문/팀)] → [새 프로필 등록 행] → 테이블 `min-w-[1100px]`.
- 제목 옆 캡션: "월간 리포팅(퇴직·휴직·신규입사·위치·만기 예고)의 판단 기준".
- 등록 행: 텍스트 input(placeholder "렌탈리스트 외 사용자 이름으로 새 인사 프로필 추가") + [등록] emerald.
- 테이블 컬럼: 이름 · 출처(배지: sky `렌탈리스트 인수 대기` / emerald `입력됨`) · 부문/팀 · 인사상태(select: 재직/수습/휴직/출산휴가/육아휴직/파견/퇴직/기타) · 근무위치(select: 본사/지사/재택/해외지사/출장중) · 직급(input) · 입사일(date) · 퇴직(예정)일(date) · 비고(input) · 저장(버튼, 역할/저장 중 상태 포함).
- PK = `user_name`(렌탈리스트 파생 + 임의 입력). ERP 연동 가정 — 인사 시스템을 단일 진실원천으로.

## B7. 이관 그래프(라인리지) & 지갑 상태
- 페이지: `/assets/{management_no}/lineage` — 자산 요약(관리번호·모델·시리얼·상태·현 담당) + ReactFlow.
- **라인리지 그래프 노드** = 지갑: 사각 노드 208×108px(`w-52`), 보더/배경은 지갑별 **hue 0~359** (`hsl(h 60% 45%)` 보더, `hsl(h 60% 18% / .55)` 배경), 내부에 이름(라벨)·부문/팀·현재/내 것 마킹. 좌우상하 타깃 핸들.
- **엣지** = 이관: SmoothStep 화살표(MarkerType), 라벨 = 시각·서명/이관시각 표시. 다이아몬드 체인 형태(생성자가 중앙 상단).
- 배경: dot 그리드. 지갑 주소 표시는 mono `6자…4자`.
- 지갑 상태 헤더(공통 글로벌 헤더): A4 참조.

---

# C. 플로우 다이어그램 (FigJam)

figjm용 스텐실: swimlane 3~4개(앨리스/밥/찰리/시스템), 상태 박스, 화살표, 주석.

## C1. 인수인계 3단계 (Alice → Bob → Charlie)
Swimlane: **앨리스(담당자)** / **밥(수신자)** / **찰리(관리자)** / **시스템(서버+Spl프로그램)**
1. 앨리스: "이전 요청" 버튼 → `pending_to_wallet = Bob` (DB) — 취소 가능.
2. 밥: 인수 승인/거절 → `pending_receiver_approved_at|rejected_at` (DB).
3. 찰리: 최종 승인 → ① 서비스 지갑이 `create_handover(from=Alice, to=Bob)` 온체인 실행(1서명) ② `transfer_tx` 기록 ③ DB `managed_by → Bob` ④ `transfer_history` 삽입.
- 분기: 밥 거절 시 → 찰리 승인 불가(붉은 X) / 같은 요청 두 번 → 멱등(조건부 업데이트).
- 거절/취소 시 진행 상태 초기화(`pending_rejected_at` 기록).
- 배치: 찰리가 여러 건을 한 트랜잭션(≤6건)으로 — "한 번에 N건 승인·확정" (C5 참조).

## C2. 지갑 로그인 / 프로필 플로우
1. [지갑 연결] 클릭 → Privy(Google OAuth + 임베디드 지갑) 또는 Phantom.
2. 연결 성공 → 헤더에 초록 점 + 이름 + 주소(mono).
3. [프로필 팝업] 열기 → 네트워크(Mainnet/Devnet) · 내 정보(라벨·부문/팀 등록/수정) · 지갑 주소 복사 · 로그아웃.
4. 관리자면 추가: 결제 지갑 SOL 잔액 표시.
- 모든 API는 `x-wallet`(사용자) 또는 `x-admin-wallet`(관리자) 헤더로 식별.

## C3. 자산 수명주기 (Lifecycle)
노드 순환: `등록(관리번호+모델)` → `정상사용(배정)` →`유휴` ⇄ `정상사용`(이관) → `계약종료`.
- 이관이 일어날 때마다 라인리지 노드 추가(온체인 서명 기록). 유휴는 전사 공개 목록에 노출.

## C4. 월간 리포팅 판정 로직 (의사 결정 트리)
인풋: `자산(user_name, location, status, rental_end_date)` + `인사프로필(employment_status, work_location, hire_date, departure_date)`.
1. `status ≠ 계약종료` 이고 프로필 매칭되면 ↓
2. 우선순위 체크(좌→우로 첫 매치):
소요 → 퇴직(red) → 퇴직예정(3개월 윈도우, orange) → 신규입사(당월 hire, emerald) → 휴직·출산·육아(amber) → 파견(violet) → **자산위치 카테고리 ≠ 근무위치** → 자산-근무지 위치 상이(violet) → 수습(cyan) → 기타(neutral).
3. 별도로 만기 도래: `rental_end_date ≤ +3개월 말`(과거 포함) → days_left<0 `기한 경과(red)` / 그 외 `D-N(amber)`.
- 자산위치 카테고리 매핑: 해외→해외지사, 지사→지사, 본사/사옥/HQ→본사, 재택→재택, 미상→비교 제외.

## C5. 일괄 승인 배치 흐름
1. 찰리가 체크박스로 N건 선택(수신자 승인 완료+정상사용만).
2. 배치: N ≤ 6은 한 트랜잭션, 초과 시 6개씩 청크.
3. 실패 시 자동 개별 폴백 → 성공한 건만 DB 반영.
4. 결과: 성공 M / 실패 K / 제외 L 표시. 수수료 = 트랜잭션 수 × 5,000 lamports(서명 1개).

---

# D. 아키텍처 다이어그램 (백서 이미지용)

피그마 캔버스(와이드 1600~2000px)로 제작해 `BLOCKCHAIN_WHITEPAPER.md`·포트폴리오에 삽입.

## D1. 더블-레저 설계 (이중 원부)
좌우 2-컨테이너 배치.
- 좌 [Off-chain — Supabase(PostgreSQL, RLS)]: 자산 마스터(모델·시리얼·렌탈·청구·상태), 담당 지갑(`managed_by`), 승인/거절 타임스탬프, 인사 프로필, 만기·리포팅.
- 우 [On-chain — Solana `create_handover`]: `asset_id · asset_code · from · to` 이벤트 + 트랜잭션 서명(서비스 지갑 1서명) → 위변조 불가 증거.
- 중앙 연결점: `transfer_tx`(=서명) 가 다리를 잇는다. 캡션: **"동의는 장부(DB), 실행 증거는 온체인"**.

## D2. 시스템 구성도
상단 유저(브라우저) → [Next.js(App Router)] → ① [Privy/Phantom 지갑] ② [Supabase] ③ [Solana(Anchor 프로그램 ID)].
- 서버만 가진 것 표시: `SUPABASE_SERVICE_ROLE_KEY`, `FEE_PAYER_SECRET`, `ADMIN_WALLETS`.
- 환경: Mainnet/Devnet 분기, `~/.anchor` fee payer(서비스 지갑).

## D3. 인증·호출 헤더 흐름
`x-wallet`(로그인) / `x-admin-wallet`(관리자 화이트리스트) 헤더가 "사용자→Route Handler→DB/온체인"을 통과하는 단순 스트립 다이어그램.

## D4. 배치 트랜잭션 / 수수료 비교 (인포그래픽)
- 좌 시나리오 [개별 4건 처리]: 4개 트랜잭션 × 1서명 5,000L = **20,000 lamports**(다중서명 확장 시 60,000).
- 우 시나리오 [배치 1건]: 1개 트랜잭션 1서명 = **5,000L** (배치 4자산 동일).
- 바 바로 표기: 배치 절감 ▲, 공식 "수수료 ≈ Σ(트랜잭션 건수) × 고유 서명자 수 × 5,000 lamports". 계정 키 중복은 1232B 크기 제한 내 중복 제거됨을 주석.

---

# E. 작업 우선순위 (포트폴리오 영향도)

1. **D1 + D4** (더블-레저, 배치 수수료) — 차별점 1순위, 백서 이미지로 바로 사용.
2. **B1-1/B1-2** (월간 리포팅) — 리드 룰이 복잡한 만큼 스팩 설득력.
3. **C1** (인수인계 3단계) — 블록체인 + 협업 워크플로우 스토리.
4. **A3 배지 시스템 + A4 컴포넌트** — 디자인 시스템 완성도.
5. B5(관리자 콘솔), B6(인사), B7(라인리지) — 운영 도구 범위 확장성.
6. B2/B3/B4 — 나머지 화면 일관성.