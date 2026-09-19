# Asset-Guard 비용 문서

지갑 인수인계(이관) 시스템이 Solana Devnet에서 발생시키는 비용을 정리한 문서.
실측 트랜잭션(2026-09-18, `4VxoMUNELXaHGVyoM7xgK9Nch2EDWRPHC17uXstTxhS2MwuKaVVHb8Jt89L2qdhPAgL8tPZMzMA93uC9mWX1VMuM`) 기준.

---

## 1. 비용 개요

| 항목 | 금액 (SOL) | 금액 (lamports) | 발생 시점 | 특성 |
|---|---|---|---|---|
| 트랜잭션 기본 수수료 | 0.000005 | 5,000 | 이관 승인 1건마다 | 고정, Priority 미사용 |
| PDA 계정 렌트 (226B) | 0.00179832 | 1,798,320 | 자산 최초 온체인 이관 1회 | 자산당 1회, 반환 불가 |
| 프로그램 계정 렌트 | 0.00083312 | 833,120 | 프로그램 배포 1회 | 잠금, 해제 불가 |

> SOL 환산: 1 SOL = 1,000,000,000 lamports

---

## 2. 비용 항목 상세

### 2.1 트랜잭션 기본 수수료 — `5,000 lamports (0.000005 SOL)` 건당

- **운영 흐름**: 관리자가 이전을 승인하면 `execute-handover.ts`가 서비스(관리자) 결제 지갑으로 `create_handover` 온체인 TX를 전송.
- 수수료는 Solana **기본 요금 고정 5,000 lamports**이며(Compute Unit과 무관), 현재 우선순위(priority) 수수료는 사용하지 않음.
- 실측: AST-2026-0019 관리자 승인 TX의 fee = `5,000 lamports`, CU 사용 9,973, 서명 1개(결제 지갑만).

### 2.2 PDA 계정 렌트 — `1,798,320 lamports (0.00179832 SOL)` 자산당 1회

- 자산별 PDA(`[b"handover", sha256(asset_id)]`)를 최초 `create_handover`가 `init_if_needed`로 생성.
- 계정 크기 226바이트(Handover 구조체)에 대한 rent-exempt 최소 예치금. **렌트는 반환되지 않는 잠금 비용**.
- 이후 동일 자산의 재이관은 PDA를 재사용하므로 **추가 렌트 없음**.
- 실측: PDA `FPqgCC9VmQLd…` — owner `5U6NZm5…`, data 226B, lamports `1,798,320`.

### 2.3 프로그램 계정 렌트 — `833,120 lamports (0.00083312 SOL)` 배포 1회

- asset_guard 프로그램이 배포될 때 프로그램 계정이 보유하는 rent.
- 실측: `5U6NZm5aNtzEeWEdzuZiciRbmFo8wLEzxBfcXnEjgkJ3` — BPFLoaderUpgradeable 소유, executable=1, lamports `833,120`.
- 네트워크·프로그램 버전이 그대로인 동안 변하지 않는 고정비.

### 2.4 우선순위(Priority) 수수료 — 현재 미사용

- RPC 혼잡 시 포함 가능한 선택 비용. 현재는 적용하지 않아 기본 요금만 지출.

---

## 3. 현재까지의 실제 비용 (2026-09 기준)

### 3.1 지갑·계정 상태

| 대상 | 주소 | 잔액/상태 |
|---|---|---|
| 서비스(결제) 지갑 | `Gmecuit5ADy3i7CXpbAcFJ4VzYR4uYeb6gcyTNUbPzjy` | 60,068,480 lamports = **0.06006848 SOL** |
| asset_guard 프로그램 | `5U6NZm5aNtzEeWEdzuZiciRbmFo8wLEzxBfcXnEjgkJ3` | 833,120 lamports (렌트 잠금) |
| PDA (AST-2026-0018) | — | 1,798,320 lamports (렌트 잠금) |
| PDA (AST-2026-0019) | `FPqgCC9VmQLd…` | 1,798,320 lamports (렌트 잠금) |

### 3.2 누적 지출·잠금 요약

| 구분 | 산식 | 금액 (SOL) |
|---|---|---|
| 온체인 TX 수수료 (8건) | 8 × 0.000005 | 0.00004 |
| PDA 계정 렌트 (2개 자산) | 2 × 0.00179832 | 0.00359664 |
| 프로그램 계정 렌트 | 1 × 0.00083312 | 0.00083312 |
| **합계** | | **≈ 0.00446976** |

> 이관 이력 8건 중 온체인 확정은 2개 자산(AST-2026-0018, AST-2026-0019)에 대해 발생. 나머지 자산은 DB 상 이력만 존재하고 온체인 TX 없음.

---

## 4. 앞으로 거래가 발생할 때의 비용

### 4.1 신규 자산의 첫 이관

운영 비용 = **0.00180332 SOL** (`5,000` 수수료 + `1,798,320` PDA 렌트)

```
5,000 (TX) + 1,798,320 (PDA 생성) = 1,803,320 lamports = 0.00180332 SOL
```

### 4.2 이미 PDA가 생성된 자산의 재이관 (A→B→A 왕복 포함)

운영 비용 = **0.000005 SOL** (수수료만)

```
PDA 재사용 → 렌트 없음, 5,000 lamports = 0.000005 SOL
```

### 4.3 온체인 TX가 발생하지 않는 작업 — 무료

- 이전 요청 (A 요청)
- 수신자 승인 / 거절
- 관리자 거절(reject)
- DB 이력 조회, 지갑 프로필 등록

### 4.4 이관 N건 총 비용 공식

```
총 비용 = 0.00083312(프로그램) + 0.00179832 × (온체인 최초 이관 자산 수) + 0.000005 × (온체인 확정 TX 수)
```

---

## 5. 결제 지갑 관리 (충전 기준)

- **주소**: `Gmecuit5ADy3i7CXpbAcFJ4VzYR4uYeb6gcyTNUbPzjy`
- **확인 방법**: 지갑 정보 패널 → "결제 지갑 SOL" (관리자 전용) 또는 RPC `getBalance`.
- **충전 필요 잔액 가이드**:
  - 양산 이관 예정 자산 수 × 0.00180332 + 예상 재이관 횟수 × 0.000005 이상을 유지 권장.
  - 예) 신규 자산 10대 이관 = 약 **0.018 SOL** 필요.
- **주의**: 결제 지갑 잔액이 부족하면 온체인 승인이 실패하고 이관이 중단됨.

---

## 6. Mainnet 전환 시 예상 비용 (참고)

> SOL 실매입 기준의 즉치표. 정확한 비용은 전환 시점의 SOL 시세·렌트율·혼잡 수수료로 재계산 필요.

| 항목 | SOL | ₩/USD (SOL ≈ $100 기준 예시) |
|---|---|---|
| 이관 TX 수수료 (건당) | 0.000005 | ≈ $0.0005 |
| 신규 자산 첫 이관 (수수료 + PDA 렌트) | 0.00180332 | ≈ $0.18 |
| 프로그램 계정 렌트 | 0.00083312 | ≈ $0.083 |

- devnet과 달리 **SOL을 실매입**해야 하며, Mainnet의 **렌트율·수수료 기본값은 동일 구조** 이나 혼잡 시 priority fee가 추가될 수 있음.
- 본 문서의 devnet 수치가 Mainnet 기준 단가로 그대로 적용된다는 보장은 없음.

---

## 7. 참조

- 실측 트랜잭션: <https://explorer.solana.com/tx/4VxoMUNELXaHGVyoM7xgK9Nch2EDWRPHC17uXstTxhS2MwuKaVVHb8Jt89L2qdhPAgL8tPZMzMA93uC9mWX1VMuM?cluster=devnet>
- 관련 코드:
  - `src/lib/solana/execute-handover.ts` — 온체인 `create_handover` 실행 (fee pay by service wallet)
  - `src/lib/solana/pda.ts` — PDA 시드 규칙
  - `src/app/api/rental-assets/[management_no]/transfer-request/approve/route.ts` — 관리자 승인·온체인 확정
  - `src/lib/solana/fee-payer.ts` — 결제 지갑 키(서버 전용)
  - `programs/asset_guard/src/lib.rs` — `Handover` 구조체·공간 계산