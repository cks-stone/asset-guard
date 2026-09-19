# Asset-Guard 아키텍처

렌탈 자산 수명주기(등록 → 이전요청 → 수신 승인 → 확정)를 관리하는 솔라나 + Next.js 기반 웹 애플리케이션.

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
│   ├── migrations/             # 0011까지 스키마 마이그레이션
│   └── seed.sql                # 렌탈 자산 장부 시드 20건
├── src/
│   ├── app/
│   │   ├── page.tsx            # 메인 대시보드
│   │   ├── assets/[management_no]/lineage/page.tsx  # 이력 라인마크
│   │   └── api/                # Route Handlers (전부 runtime=nodejs)
│   ├── components/
│   │   ├── dashboard.tsx       # 일반 사용자 대시보드
│   │   ├── admin-console.tsx   # 관리자(화이트리스트) 콘솔
│   │   ├── wallet-status.tsx   # 지갑 연결 상태 헤더
│   │   ├── lineage-view.tsx / lineage-graph.tsx  # 이력 트리 뷰
│   │   ├── billing-calendar.tsx
│   │   └── wallet-directory-picker.tsx
│   └── lib/
│       ├── admin.ts            # 지갑/관리자 인증 헬퍼
│       ├── config/env.ts       # 환경변수 스키마(단일 진입점)
│       ├── anchor/             # 프로그램 IDL/프로바이더
│       ├── solana/             # PDA, fee-payer, 실행/온체인 상태
│       ├── supabase/           # client/server/타입
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
| `/api/rental-assets` | GET | 로그인 | 담당 자산 조회(`managed_by`), `all=1` 관리자 전체, `incoming=1` 수신 대기 |
| `/api/rental-assets` | POST | 로그인 | 렌탈 자산 등록 |
| `/api/rental-assets/[management_no]` | GET/PATCH | 로그인 | 단건 조회/수정 |
| `/api/rental-assets/[management_no]/transfer-request` | POST/DELETE | 로그인 | 이전 요청 생성/취소 |
| `/api/rental-assets/[management_no]/transfer-request/approve` | POST | 관리자 | 이전 요청 승인 |
| `/api/rental-assets/[management_no]/transfer-request/receiver` | POST | 로그인 | 수신자 인수 승인/거절 |
| `/api/rental-assets/[management_no]/confirm` | POST | 로그인 | 확정 저장(이력 기록) |
| `/api/rental-assets/transfer-request/approve-batch` | POST | 관리자 | 일괄 승인 |
| `/api/assets/[management_no]/lineage` | GET | 로그인 | 자산 이력 라인마크 |
| `/api/wallet-balance` | GET | 로그인 | Sol 잔액 조회 |
| `/api/wallet-label` | GET/POST | 로그인 | 지갑 프로필(부문/팀) 저장·조회 |
| `/api/wallet-directory` | GET | 로그인 | 지갑 디렉토리 탐색 |
| `/api/admin/config` | GET | 관리자 | 관리자 설정 조회 |

## 데이터 모델 (Supabase)

핵심 테이블과 이전(transfer) 컬럼 확장:

- `public.rental_assets` — 자산 마스터 (관리·시리얼·모델·렌탈·청구·사용자)
  - `status`: `정상사용` / `유휴` / `계약종료`
  - `managed_by`: 담당 지갑 (0006)
  - `transfer_tx`, `transferred_at`: 온체인 이전 트랜잭션 (0007)
  - `pending_to_wallet`, `pending_requested_at`, `pending_approved_at`, `pending_approved_by`: 승인 대기 상태 (0008)
  - `pending_receiver_approved_at`, `pending_receiver_rejected_at`: 수신자 인수 확정 (0010)
- `public.wallet_labels` — 지갑별 프로필/부문·팀 (0011), 디렉토리 인덱스
- `public.transfer_history` — 이전 이력 (0009)
- `public.assets` / `public.handovers` — (구버전 M1~, 0004에서 정리)

## 이관 흐름 (요청 → 배치 승인 → 수신 승인 → 확정)

1. 담당자 A가 `/transfer-request` 로 이전 요청 → `pending_to_wallet = B`
2. 관리자가 `/approve` 단건 또는 `/approve-batch` 일괄 승인
3. 수신자 B가 `/receiver` 로 인수 승인/거절
4. `/confirm` 으로 `transfer_tx` + `transferred_at` + 이력 기록 확정

## 환경변수

정의 스키마는 `src/lib/config/env.ts`(Zod — import 시점 검증). 배포(Vercel) 시 입력 값은 [COSTS.md](./COSTS.md) 및 루트 `.env.example` 참고.

- 브라우저: `NEXT_PUBLIC_SOLANA_NETWORK`, `NEXT_PUBLIC_SOLANA_RPC_URL`, `NEXT_PUBLIC_ASSET_GUARD_PROGRAM_ID`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_PRIVY_CLIENT_ID`, `NEXT_PUBLIC_FEE_PAYER_ADDRESS`, `NEXT_PUBLIC_APP_ENV`
- 서버 전용: `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_WALLETS`, `FEE_PAYER_SECRET` (+ 옵션: `ADMIN_SECRET`, `EMAIL_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`)

## 깜빡임(플래시) 동기화 설계

`applyDiff`(dashboard.tsx / admin-console.tsx)는 이전 스냅샷과 비교해 **실제 변경된 행만** `flashNos`에 등록하고 5초간 하이라이트. 자동 재조회(폴링·포커스 복귀 = quiet)에서도 diff를 적용해, 타 계정의 이전요청·승인이 상대 화면에 도착할 때 해당 행만 깜빡인다. 첫 로드(빈 prev)만 예외.
```