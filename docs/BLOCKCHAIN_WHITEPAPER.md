# 현재 블록체인(솔라나)이 적용된 방식 — Asset-Guard 백서

> 렌탈 자산의 **인수인계(handover) 사실**을 솔라나 온체인에 위변조 불가로 기록하는,
> "오프체인 장부(DB) + 온체인 증거(transaction)" 2원 구조를 설명합니다.
> 등장인물은 앨리스(담당자), 밥(수신자), 찰리(관리자)로 표현합니다.

---

## 1. 문제 정의

회사의 렌탈 장비(노트북·모니터 등)는 담당자 간에 자주 이관됩니다.

- "누가 이 장비의 현재 담당인가?"
- "이 장비는 어떤 경로를 거쳐 여기까지 왔는가?"
- "이관이 실제로 실행되었다는 **증거**는 남아 있는가?"

전통적 시스템(엑셀/내부 장부)은 이관 기록을 쉽게 삭제·변조할 수 있어
감사(감사증적)와 신뢰가 어렵습니다. Asset-Guard는 이관이 확정되는 순간을
**솔라나 트랜잭션**으로 고정해 위조 불가한 이력(lien·lineage)을 만듭니다.

---

## 2. 등장인물 (Roles)

| 역할 | 개념 | 시스템 상 표현 |
|---|---|---|
| **앨리스 (Alice)** | 자산의 현재 담당자. 이관을 **요청**하는 쪽 | `managed_by = Alice 지갑` |
| **밥 (Bob)** | 이관을 **받을** 후보. 인수 **동의** 또는 **거절**하는 쪽 | `pending_to_wallet = Bob 지갑` |
| **찰리 (Charlie)** | 관리자(화이트리스트). 이관을 **최종 승인**하고 온체인 **실행**을 결정 | `ADMIN_WALLETS` + `x-admin-wallet` |
| **서비스 지갑 (Fee-Payer)** | 찰리의 온체인 실행을 대행해 가스비를 지불하는 서비스 계정 | `FEE_PAYER_SECRET` (서버 전용 키) |

- 실제 어플리케이션에서 앨리스·밥·찰리는 모두 **솔라나 지갑 주소(base58)**이며,
  각 API 요청은 `x-wallet`(사용자) / `x-admin-wallet`(관리자) 헤더로 식별됩니다.
- 지갑 연결은 Privy(Google 로그인 + 임베디드 지갑) 또는 Phantom을 사용합니다.

---

## 3. 더블-레저(Dual Ledger) 설계

Asset-Guard는 **블록체인에 모든 것을 올리지 않습니다**. 비용과 실용성 때문에
"어디에 무엇을 저장할지"를 다음과 같이 나눴습니다.

| 영역 | 저장 위치 | 이유 |
|---|---|---|
| 자산 마스터(모델·시리얼·렌탈·청구·상태), 담당자, 인사 프로필, 필터 | **Supabase (PostgreSQL, RLS)** | 대량 데이터 질의, 인라인 수정, 리포팅이 필요 |
| **이관 실행 사실** (from → to, 시각, 서명) | **솔라나 온체인 (create_handover)** | 삭제·변조 불가, 감사증적 |
| 앨리스·밥의 동의(승인/거절) 시각 | Supabase 타임스탬프 | 지갑 서명 없이도 "누가 언제 결의했는지" 보존 |

> 즉, "**동의(off-chain) + 실행(on-chain)**" 이중 기록입니다. 온체인은
> "이 이관이 실제로 실행됐다"는 확정 사실의 증거로 쓰이고, 경영 판단에 필요한
> 부가 데이터(금액, 인사 정보, 만기 등)는 장부에 있습니다.

---

## 4. 3-Way 인수인계 프로토콜

앨리스 → 밥 자산 이관은 **3단계 결의**로 진행됩니다.

### 4.1. 1단계 — 앨리스의 이전 요청

```
POST /api/rental-assets/{management_no}/transfer-request
Headers: x-wallet: Alice
```

- 앨리스가 대상 지갑(밥)을 지정하면 `rental_assets`에
  `pending_to_wallet = Bob`, `pending_requested_at = now`이 기록됩니다.
- 자산 상태가 `유휴`가 아닌 진행 중 요청과 동일 자산 중복 요청은 차단됩니다.
- 앨리스는 확정 전이라면 요청을 **취소**(DELETE)할 수 있습니다.

### 4.2. 2단계 — 밥의 인수 동의 / 거절

```
POST /api/rental-assets/{management_no}/transfer-request/receiver
Headers: x-wallet: Bob   Body: { action: "approve" | "reject" }
```

- 밥이 승인하면 `pending_receiver_approved_at = now` → **"수신자 승인"** 상태.
- 밥이 거절하면 `pending_receiver_rejected_at = now` → **"수신자 인수 거절"** 상태.
  이후 찰리는 이 자산의 이전을 승인할 수 없습니다(화면에서 암 암호화).

### 4.3. 3단계 — 찰리의 최종 승인 = 온체인 실행

```
POST /api/rental-assets/{management_no}/transfer-request/approve
Headers: x-admin-wallet: Charlie
```

전제 조건:
- 밥의 인수 승인(`pending_receiver_approved_at`)이 선행되어야 하며
- 인수 거절(`pending_receiver_rejected_at`)이 없어야 하고
- 자산 상태가 `정상사용`이어야 합니다.

승인 시 일어나는 일:

1. 서비스 지갑(fee-payer)이 솔라나 Anchor 프로그램의
   `create_handover(asset_id, asset_code, from, to)` 지시를 단독 서명·전송합니다.
2. 온체인 서명(`transfer_tx`), 실행 시각(`transferred_at`)이 확보되면
3. DB에서 **조건부 업데이트**로 소유권을 이전합니다.
   `managed_by: Alice → Bob`, 진행 상태 컬럼 초기화.
4. `transfer_history`에 이관 이력(from/to/서명)을 기록합니다.

> **온체인 기록의 의미**: 블록체인에는 "이 장비가 앨리스에서 밥으로 이관되었다"
> 는 사실과 from/to 주소·서명만 남습니다. 서명자는 서비스 지갑이지만
> 그 실행 결정은 찰리(관리자)의 승인이며, 앨리스·밥의 동의 시각은
> DB 타임스탬프로 독립 보존됩니다. — 즉 **실행 증명은 온체인, 결의 이력은 장부**.

### 4.4. 거절/취소 시 상태 초기화

- 찰리 거절(reject) 또는 앨리스 취소(DELETE)는 진행 중 요청(수신자 결의 포함)을
  초기화하고 `pending_rejected_at`을 남겨 "거절된 적 있는 요청"으로 표시합니다.

---

## 5. 일괄 승인 — 배치 트랜잭션

여러 건의 이관을 한 트랜잭션에 묶어 **서명 1회, 수수료 1회**로 처리합니다.

- 솔라나 트랜잭션 크기 제한(레거시 ≈ 1232B)을 고려해 배치 크기를 **최대 6건**으로 고정
  (계정키 3N+2 × 32B + 지시 데이터 계산에서 유도).
- 배치 트랜잭션은 **원자성**: 하나라도 실패하면 전체 롤백.
- 실패 시 **개별 폴백**: 각 항목을 단건 트랜잭션으로 재실행해 "한 건이 문제여도
  나머지는 처리"를 보장합니다(탄력성).
- 각 자산의 DB 반영은 호출부가 **서명 기준**(이미 온체인에 존재하는 서명)으로 수행합니다.

```
POST /api/rental-assets/transfer-request/approve-batch
Headers: x-admin-wallet: Charlie
```

---

## 6. 멱등성(멀티-클릭/중복 요청 안정성)

승인 라우트는 DB 업데이트에 **조건부 업데이트**를 사용합니다.
`managed_by == 기존 담당자` AND `pending_to_wallet == 수신자`일 때만 반영되므로
같은 요청이 두 번 들어와도 두 번째는 조건 불일치로 스킵됩니다.
스킵 시 DB를 재조회해 **이미 동일 서명으로 반영되었는지** 확인해
"이미 완료"로 응답합니다(멱등).

---

## 7. 신원/권한 모델

| 항목 | 방식 |
|---|---|
| 사용자 인증 | `getWalletFromRequest` — `x-wallet` 헤더 주소 |
| 관리자 인증 | `getAdminWalletFromRequest` — `x-admin-wallet` + `ADMIN_WALLETS` 화이트리스트 |
| 서명 권한 | `FEE_PAYER_SECRET` 키는 **서버 전용**(`server-only`, 브라우저 미노출) |
| 온체인 실행 | `execute-handover.ts` — AnchorProvider + 서비스 지갑 단독 서명 |

---

## 8. 관련 온체인/장부 필드

`public.rental_assets` (Supabase):

| 컬럼 | 의미 |
|---|---|
| `managed_by` | 현재 담당 지갑 (앨리스) |
| `pending_to_wallet` | 이전 요청 대상 지갑 (밥) |
| `pending_requested_at` | 요청 시각 (앨리스) |
| `pending_receiver_approved_at` / `pending_receiver_rejected_at` | 밥의 인수 결의 |
| `pending_approved_at` / `pending_approved_by` | 찰리 승인 기록 |
| `transfer_tx` / `transferred_at` | **온체인 실행 서명 / 시각** |
| `status` | 정상사용 / 유휴 / 계약종료 |

`public.transfer_history` — (management_no, from_wallet, to_wallet, transfer_tx, transferred_at).

`lineage` 화면(`/assets/{no}/lineage`)은 장부 이력 + 온체인 서명을 트리 그래프로
시각화해 "이 장비의 전 생애"를 추적합니다.

---

## 9. 신뢰 모델의 의의와 한계

**의의**
- 이관 사실이 온체인 서명으로 고정 → 사후 변조·부인 불가.
- 관리자가 아닌 일반 사용자도 자산의 전체 이력을 투명하게 추적 가능.
- 배치 서명으로 가스비(수수료) 절감.

**한계 (목적-설계적)**
- 탈중앙 검증(노드 합의)보다는 **감사증적(audit trail)** 목적이 우선입니다.
- 온체인에는 실행 사실만 있고 금액·인사 등 상세는 오프체인 장부에 있어,
  완전한 체인 상 자산 등록(토큰화) 형태는 아닙니다.
- 차기 확장 시: NFT/SPL 토큰과 자산 1:1 연동, 할당 시점 서명, 지갑 자체 서명
  모델(수신자도 서명)로 강도 높은 탈중앙화를 추가할 수 있습니다.