# Asset-Guard 아키텍처

렌탈 자산 수명주기(등록 → 이전요청 → 수신 인수 → 관리자 승인·온체인 이관)와 유휴 자산 확정을 관리하는 솔라나 + Next.js 기반 웹 애플리케이션.

## 기술 스택

| 영역 | 스택 |
|---|---|
| 웹 프레임워크 | Next.js 15 (App Router), React 19 |
| 지갑 인증 | Privy(Google 로그인 + 임베디드 Solana 지갑), Phantom |
| 온체인 | Solana web3.js v1, Anchor (@coral-xyz/anchor 0.31), @solana/kit |
| DB | Supabase (PostgreSQL, RLS) |
| 스타일 | Tailwind CSS v4 |
| 검증 | Zod |
| 배포 | Vercel |

## 디렉토리 구조

```
.
├── Anchor.toml                 # Anchor 프로그램 설정 (localnet/devnet)
├── programs/asset_guard        # Solana Anchor 프로그램 (Rust)
├── tests/                      # Anchor 통합 테스트 (ts-mocha)
├── supabase/
│   ├── migrations/             # 0014까지 스키마 마이그레이션
│   └── seed.sql                # 렌탈 자산 장부 시드 20건 (AST-2026-0001~0020)
├── src/
│   ├── app/
│   │   ├── page.tsx            # 메인 대시보드
│   │   ├── assets/[management_no]/lineage/page.tsx  # 이관 그래프(라인리지)
│   │   └── api/                # Route Handlers (전부 runtime=nodejs)
│   ├── components/
│   │   ├── dashboard.tsx       # 대시보드(탭 네비게이션, 통계 카드)
│   │   ├── my-assets-list.tsx  # 내 자산 목록 + 이전 요청/수신 처리
│   │   ├── idle-assets-list.tsx# 유휴 자산(전사 공개)
│   │   ├── monthly-report.tsx  # 월간 리포팅 (①확인 필요 ②만기 도래)
│   │   ├── admin-console.tsx   # 관리자(화이트리스트) 콘솔
│   │   ├── hr-management.tsx   # 인사 정보 관리
│   │   ├── wallet-status.tsx   # 지갑 연결 상태 헤더
│   │   ├── lineage-view.tsx / lineage-graph.tsx  # 이관 그래프 뷰 (ReactFlow)
│   │   ├── billing-calendar.tsx
│   │   ├── asset-filter-bar.tsx
│   │   └── wallet-directory-picker.tsx
│   └── lib/
│       ├── admin.ts            # 지갑/관리자 인증 헬퍼
│       ├── config/env.ts       # 환경변수 스키마(단일 진입점)
│       ├── anchor/             # 프로그램 IDL/프로바이더
│       ├── solana/             # fee-payer, 온체인 실행(단건/배치)
│       ├── supabase/           # client/server/타입/필터
│       └── wallet/             # Privy·Phantom·지갑 컨텍스트
└── docs/COSTS.md               # 비용 관련 문서
```

## 인증 모델

- **로그인**: Privy 임베디드 지갑(Google OAuth) — `src/lib/wallet/privy.ts`
- **사용자 식별**: 모든 API는 `x-wallet` 헤더로 지갑 주소 검증 (`getWalletFromRequest`)
- **관리자**: `ADMIN_WALLETS` 화이트리스트(콤마 구분 base58) + `x-admin-wallet` 헤더 (`getAdminWalletFromRequest`)
- **서버 시크릿**: `SUPABASE_SERVICE_ROLE_KEY`, `FEE_PAYER_SECRET` — 서버 전용, 브라우저 미노출

## API (Route Handlers)

실행 환경은 전부 `runtime = "nodejs"`(서버 시크릿 사용).

| 라우트 | 메서드 | 권한 | 용도 |
|---|---|---|---|
| `/api/rental-assets` | GET | 로그인 | 담당 자산 조회(`managed_by`), `all=1` 관리자 전체, `incoming=1` 수신 대기, `idle=1` 전사 유휴 |
| `/api/rental-assets` | POST | 로그인 | 렌탈 자산 등록 |
| `/api/rental-assets/[management_no]` | GET | 로그인 | 단건 조회 |
| `/api/rental-assets/[management_no]` | PATCH | 관리자 | 자산 정보 수정(카테고리·사용자·부문/팀·위치·렌탈료·기간·상태) |
| `/api/rental-assets/[management_no]/transfer-request` | POST/DELETE | 로그인 | 이전 요청 생성/취소 |
| `/api/rental-assets/[management_no]/transfer-request/approve` | POST | 관리자 | 이전 요청 최종 승인(온체인 이관 + DB 소유권 이전) |
| `/api/rental-assets/[management_no]/transfer-request/receiver` | POST | 로그인 | 수신자 인수 승인/거절 |
| `/api/rental-assets/[management_no]/confirm` | POST | 로그인 | 유휴 자산 → 정상사용 확정(온체인 아님, `managed_by` 전용) |
| `/api/rental-assets/transfer-request/approve-batch` | POST | 관리자 | 일괄 승인(자산별 성공/실패/제외 반환) |
| `/api/assets/[management_no]/lineage` | GET | 로그인 | 자산 이관 그래프 |
| `/api/monthly-report` | GET | 로그인 | 월간 리포팅(남은 기간 · 권장 조치) |
| `/api/employees` | GET | 관리자 | 인사 프로필 조회(렌탈리스트 자동 제안 포함) |
| `/api/employees` | POST | 관리자 | 인사 프로필 등록/수정(upsert) |
| `/api/wallet-balance` | GET | 로그인 | SOL 잔액 조회 |
| `/api/wallet-label` | GET/POST | 로그인 | 지갑 프로필(부문/팀) 저장·조회 |
| `/api/wallet-directory` | GET | 로그인 | 지갑 디렉토리 탐색 |
| `/api/admin/config` | GET | 관리자 | 관리자 설정 조회(ADMIN_WALLETS · fee payer 주소) |

## 데이터 모델 (Supabase)

핵심 테이블과 이전(transfer) 컬럼 확장:

- `public.rental_assets` — 자산 마스터 (관리번호·시리얼·모델·렌탈·청구·사용자)
  - `status`: `정상사용` / `유휴` / `계약종료`
  - `managed_by`: 담당 지갑 (0006)
  - `category` (0013), `location` (0014), `order_no`: 발주번호
  - `transfer_tx`, `transferred_at`: 온체인 이전 트랜잭션 (0007)
  - `pending_to_wallet`, `pending_requested_at`, `pending_approved_at`, `pending_approved_by`: 관리자 승인 대기 상태 (0008)
  - `pending_receiver_approved_at`, `pending_receiver_rejected_at`: 수신자 인수 승인/거절 (0010)
- `public.wallet_labels` — 지갑별 프로필/부문·팀 (0009 기본, 0011 분·팀 추가), 디렉토리 인덱스
- `public.transfer_history` — 이전 이력 (0009)
- `public.employee_profiles` — 인사 프로필 (0014, `user_name` 유니크 upsert; 인사 상태/근무 위치/직급/입·퇴사일; 0015에서 `division`/`department` 부문·팀 추가)
- `public.assets` / `public.handovers` — (구버전 M1~, 0004에서 정리)

> **온체인 기록**: 이관 증거는 자산별 PDA 계정이 아니라 **트랜잭션 서명 + `HandoverCreated` 이벤트 로그**(무계정, account-less)로 남는다. 자세한 내용은 [BLOCKCHAIN_DESIGN.md](./BLOCKCHAIN_DESIGN.md) 참고.

## 이관 흐름 (요청 → 수신 인수 → 관리자 승인 · 온체인 이관)

1. 담당자 A가 `/transfer-request`로 이전 요청 → `pending_to_wallet = B` (접수 상태는 `정상사용`인 경우만)
2. 수신자 B가 `/receiver`로 인수 승인/거절 → `pending_receiver_approved_at` / `pending_receiver_rejected_at`
3. 관리자가 `/approve`(단건) 또는 `/approve-batch`(일괄)로 최종 승인 — 서비스 지갑(`FEE_PAYER_SECRET`)이 온체인 `create_handover`를 단독 실행하고, 성공 시에만 `managed_by = B`로 소유권 이전 및 이력 기록(`transfer_tx` 재조회)
4. 별도 확정 단계 없음 — 관리자 승인이 곧 인수·확정

> `/confirm`은 이관과 무관. **유휴 상태 자산을 담당자가 정상사용으로 확정**(재사용 인수)할 때 사용하며 온체인 트랜잭션을 발행하지 않는다.

## 환경변수

정의 스키마는 `src/lib/config/env.ts`(Zod — import 시점 검증). 배포(Vercel) 시 입력 값은 [COSTS.md](./COSTS.md) 및 루트 `.env.example` 참고.

- 브라우저: `NEXT_PUBLIC_SOLANA_NETWORK`, `NEXT_PUBLIC_SOLANA_RPC_URL`, `NEXT_PUBLIC_ASSET_GUARD_PROGRAM_ID`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_PRIVY_CLIENT_ID`, `NEXT_PUBLIC_FEE_PAYER_ADDRESS`
- 서버 전용: `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_WALLETS`, `FEE_PAYER_SECRET`

## 깜빡임(플래시) 동기화 설계

`applyDiff`(my-assets-list.tsx / admin-console.tsx)는 이전 스냅샷과 비교해 **실제 변경된 행만** `flashNos`에 등록하고 5초간 하이라이트. 자동 재조회(폴링·포커스 복귀 = quiet)에서도 diff를 적용해, 타 계정의 이전요청·승인이 상대 화면에 도착할 때 해당 행만 깜빡인다. 첫 로드(빈 prev)만 예외.