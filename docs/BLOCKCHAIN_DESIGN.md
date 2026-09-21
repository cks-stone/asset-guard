# 블록체인 적용 설계 (Solana) — Asset-Guard

> **문서 성격 안내**: 이 문서는 Asset-Guard가 렌탈 자산 인수인계(handover) 사실을
> Solana에 기록하는 방식의 **구현 설계·동작 명세**입니다. 마케팅성 가치 주장이 아닌,
> 검증된 동작과 명시적인 한계를 기술합니다. (이전 `BLOCKCHAIN_WHITEPAPER.md`를 대체)

---

## 1. 목적과 범위

- **목적**: 담당자 변경(인수인계)이 확정된 사실을 변조·부인하기 어려운 형태로
  외부(체인)에 남겨 감사증적(audit trail)을 확보한다.
- **비목적**: 
  - 블록체인에 자산 전체를 등록하거나(토큰화/NFT) 금액·인사·만기 같은 운영 데이터를 올리지 않는다.
  - 사용자가 직접 지갑으로 온체인 서명하는 구조가 아니다(§5.2, §9).
- **기록 범위 결정** (§2): 체인은 "이관 확정 사실"만, 나머지는 Supabase에 둔다.

## 2. 기록 구조 (이중 저장)

| 저장 영역 | 대상 | 근거 |
|---|---|---|
| Supabase (PostgreSQL, RLS) | 자산 마스터(관리번호·시리얼·모델·렌탈·청구·상태), 담당자, 인사 프로필, 동의 타임스탬프, 이관 이력(서명 포함) | 질의·수정·리포팅이 필요한 구조적 데이터 |
| Solana 온체인 | **이관 확정 사실**(from/to·asset_id·asset_code·시각) — 트랜잭션 서명 + `HandoverCreated` 이벤트 로그 | 삭제·변조가 실질적으로 어려운 기록 매체 |

즉, "결의(동의, off-chain) + 실행 확정(on-chain)"의 이중 기록이다. 온체인은
"이관이 실제로 실행됐다"는 **확정 사실의 증거**로만 쓰이고, 경영 판단에 필요한
부가 데이터는 장부에 있다.

## 3. 시스템 구성 요소와 권한

| 구성 요소 | 역할 | 식별 방식 |
|---|---|---|
| 대상 지갑 | 자산 담당자(현 소유자) / 수신자 후보 | `getWalletFromRequest` — `x-wallet` 헤더(Privy·Phantom) |
| 관리자 | 이전 최종 승인·거절, 일괄 처리 | `getAdminWalletFromRequest` — `x-admin-wallet` + `ADMIN_WALLETS` 화이트리스트 |
| 서비스 지갑 (fee payer) | 온체인 트랜잭션 서명자, 수수료 부담 | `FEE_PAYER_SECRET`(서버 전용, 브라우저 미노출) |
| 온체인 프로그램 | 사전검증 + 이벤트 발행 (상태 저장 없음) | `5U6NZm5aNtzEeWEdzuZiciRbmFo8wLEzxBfcXnEjgkJ3` |

- 사용자/수신자/관리자는 모두 Solana 지갑 주소(base58)이며 DB에서 `managed_by`,
  `pending_to_wallet` 등으로 참조된다.
- 지갑 연결은 Privy(Google 로그인 + 임베디드 지갑) 또는 Phantom.

## 4. 인수인계 프로토콜 (단계별 동작)

3단계 결의: 담당자 요청 → 수신자 인수 결정 → 관리자 최종 승인(온체인 실행).

### 4.1 이전 요청 — `POST …/transfer-request`

- 요청 조건(순서대로 검증):
  1. 요청자는 `managed_by`(현 담당자) 본인이어야 한다.
  2. `to_wallet`은 유효한 Solana 주소이며 **자기 자신이 아니어야** 한다.
  3. `status = 정상사용`이어야 한다 (`유휴`·`계약종료` 차단).
  4. 진행 중인 요청이 없어야 한다 (중복 차단).
- 성공 시 DB에만 `pending_to_wallet`, `pending_requested_at`을 기록한다.
  온체인 트랜잭션은 **발행하지 않는다**.

### 4.2 수신자 인수 결정 — `POST …/transfer-request/receiver`

- `action=approve` → `pending_receiver_approved_at` (수신자 승인 상태)
- `action=reject` → `pending_receiver_rejected_at` (인수 거절)
- 수신자가 거절하면 이후 관리자는 이 자산을 승인할 수 없다(§4.3 전제조건).

### 4.3 관리자 최종 승인 — `POST …/transfer-request/approve`

전제조건: 진행 중 요청 존재, `pending_receiver_approved_at` 선행,
`pending_receiver_rejected_at` 부재, `status = 정상사용`.

`action=approve` 처리 절차:

1. 서비스 지갑이 `create_handover(asset_id, asset_code)` 지시를
   계정 `{ from(현 담당자), to(수신자), fee_payer(서명자) }`과 함께 전송·확인한다
   (`execute-create-handover.ts`). 이때 `asset_id`와 `asset_code` 모두 `management_no`를 사용한다.
2. 약 3초 대기 후 DB **조건부 업데이트**로 소유권을 이전한다 —
   `managed_by: A → B`, `status=정상사용`, 서명/시각 저장, 진행 상태 컬럼 전체 초기화.
   조건(`managed_by==A` AND `pending_to_wallet==B`)이 어긋나면 반영하지 않아 중복 처리를 막는다(§7).
3. `transfer_history`에 `(management_no, from, to, transfer_tx, transferred_at)`을 기록한다
   (best-effort — 실패해도 이관 자체는 완료된 것으로 처리).

> 온체인 실행이 성공한 후 DB 반영이 실패한 경우(조건 불일치)에만 500을 반환하고,
> 이 때는 "온체인은 반영됐으나 DB 미반영" 상태를 관리자에게 보고한다.

별도의 인수·확정 단계는 없다 — **관리자 승인이 곧 인수 확정**이다.

### 4.4 취소·거절 시 상태 초기화

| 경로 | 기록되는 필드 |
|---|---|
| 관리자 거절 (`approve`의 `action=reject`) | `pending_rejected_at` (**관리자 거절 사유 기록**) + 진행 상태 전체 초기화 |
| 수신자 거절 (§4.2) | `pending_receiver_rejected_at` |
| 담당자 취소 (`DELETE …/transfer-request`) | **흔적 없음** — 진행 필드 7종과 `transfer_tx`·`transferred_at`까지 전부 초기화(요청 전 상태로 복원) |

> 취소(DELETE)와 거절(reject)은 혼동하지 말 것: 거절은 "거절됨" 타임스탬프를 남기고,
> 취소는 아무 흔적도 남기지 않는다.

## 5. 온체인 프로그램 (asset_guard)

### 5.1 `create_handover` — 지시와 검증

- 인자: `asset_id: String`, `asset_code: String`
- 계정: `from: AccountInfo`(비서명, 이벤트 기록용), `to: AccountInfo`(비서명),
  `fee_payer: Signer`(수수료 부담, 서버가 보관한 키만 서명)
- 프로그램 검증:
  - `asset_id`·`asset_code`는 비어있지 않고 64자 이하 (`InvalidInput`)
  - `from ≠ to` (`SameParty`)
- 성공 시 `HandoverCreated { asset_id, asset_code, from, to, created_ts }` **이벤트만** 발행한다.
  온체인 상태는 저장하지 않는다.

### 5.2 무계정(account-less) 기록 · 전환 이력

현재 설계(신):

- 자산별 계정(PDA)을 생성하지 않고, **트랜잭션 서명 + 이벤트 로그**가 유일한 온체인 증거다.
- 이벤트 로그는 RPC·탐색기에서 영구 조회 가능하고, 전체 이력(시간순)은 DB가 보관한다.
- 비용 = 트랜잭션 수수료(5,000 lamports)뿐. 자산당 렌트 예치금 **0**.
  (비용 산정 상세는 [COSTS.md](./COSTS.md))

과거 설계(구, 2026-09 이전):

- 자산별 PDA(`[b"handover", sha256(asset_id)]`)를 생성해 226B 계정을 유지했다.
- 자산당 1,798,320 lamports 렌트 예치가 발생해 자산·이관 수만큼 잠금이 누적됐다.
- 계정 렌트·공간 문제와 무계정 이벤트 조회만으로 감사 목적을 달성할 수 있다는 판단으로
  계정 생성을 제거했다. (구버전 실측 수치는 COSTS.md 부록 참고)

> **명시적 한계(서명 주체)**: 온체인 서명자는 항상 서비스 지갑이다. 즉 체인은
> "관리자가 승인하여 실행됐다"는 **실행 사실의 무결성**을 보장하며, 사용자 개인의
> 지갑 서명 검증 기능은 아니다. 담당자·수신자의 결의는 DB 타임스탬프(§4.1, §4.2)에 의존한다.

## 6. 일괄 승인 (배치)

`POST …/transfer-request/approve-batch` — 여러 건을 한 트랜잭션으로 묶어 서명·수수료 1회로 처리.

- 배치 크기는 트랜잭션 용량 제한을 고려해 **최대 6건**으로 제한
  (계정키 3N+2 × 32B + 지시 데이터로부터 유도).
- **원자성**: 배치 중 하나라도 실패하면 전체 롤백.
- **개별 폴백**: 배치 실패 시 각 항목을 단건으로 재실행하되,
  개별 실패는 나머지 처리에 영향을 주지 않는다(부분 성공 응답).
- **응답**: 자산별 결과(성공/실패/제외) 반환. 승인 전 검증에서 거른 항목
  (수신자 미승인·이미 처리 등)은 `제외`로 분리하며, 부분 성공도 200으로 응답.
- DB 반영은 개별 승인과 동일하게 **서명 기준**으로 수행한다.

## 7. 멱등성 (중복 요청 안정성)

승인 라우트는 DB 업데이트에 **조건부 업데이트**(§4.3)를 사용하므로,
같은 요청이 두 번 들어와도 두 번째는 조건 불일치로 스킵된다.

스킵 시 DB를 재조회해 `managed_by == 수신자` AND `transfer_tx == 동일 서명`이면
"이미 완료"로 처리한다. 조건이 일치하지 않는 경우(다른 상태)에는
"온체인 반영 후 DB 미반영"으로 판단해 관리자에게 보고한다.

## 8. 데이터 모델 요약

`public.rental_assets` (전이 관련 컬럼):

| 컬럼 | 의미 |
|---|---|
| `managed_by` | 현재 담당 지갑 |
| `pending_to_wallet`/`pending_requested_at` | 요청 대상·시각 (담당자) |
| `pending_receiver_approved_at`/`pending_receiver_rejected_at` | 수신자 인수 승인/거절 |
| `pending_approved_at`/`pending_approved_by`/`pending_rejected_at` | 관리자 승인/거절 기록 |
| `transfer_tx`/`transferred_at` | 온체인 실행 서명/시각 |
| `status` | 정상사용 / 유휴 / 계약종료 |

`public.transfer_history`: `(management_no, from_wallet, to_wallet, transfer_tx, transferred_at)` —
온체인 확정 건에 대한 조회용 이력.

이관 그래프(`/assets/{no}/lineage`)는 이력 + 온체인 서명을 ReactFlow 트리로 시각화한다.

## 9. 보안·신뢰 모델

- 인증: `x-wallet`(사용자) / `x-admin-wallet` + `ADMIN_WALLETS`(관리자) 헤더 검증.
- 서명 키: `FEE_PAYER_SECRET`은 서버 전용(`server-only`), 브라우저 번들 미포함.
- 온체인 실행: `execute-handover.ts`(AnchorProvider) — 서비스 지갑 단독 서명.
- DB 쓰기: `SUPABASE_SERVICE_ROLE_KEY` 기반 관리 클라이언트($1.4), RLS 정책으로 제한.

## 10. 한계와 후속 작업

**현재 한계**

- 온체인 서명 주체가 서비스 지갑이라, 사용자 본인 인증은 DB·RLS에 의존한다 (§5.2).
- 체인에는 실행 사실만 존재하며 금액·인사 등 상세는 오프체인이라
  완전한 온체인 자산 등록(토큰화)은 아니다.
- 온체인 상태가 없으므로 "현재 담당자"를 체인만으로 조회할 수 없다 — 담당자는 DB가 진실 소스다.

**후속 작업(미구현)**

- 자산과 NFT/SPL 토큰을 1:1 연동한 토큰화
- 수신자(및 담당자)의 개인 지갑 서명으로 강도 높인 3-서명 모델
- 수신 거부·만기 등 상태 전이를 on-chain 이벤트로 확장