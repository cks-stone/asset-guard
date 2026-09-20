/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/asset_guard.json`.
 */
export type AssetGuard = {
  "address": "5U6NZm5aNtzEeWEdzuZiciRbmFo8wLEzxBfcXnEjgkJ3",
  "metadata": {
    "name": "assetGuard",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Asset-Guard 인수인계 스마트컨트랙트 — 블록체인 무결성 감사 추적 (Solana Devnet)"
  },
  "instructions": [
    {
      "name": "createHandover",
      "docs": [
        "이관 확정 — 관리자(서비스 지갑)가 승인 시점에 단독 실행.",
        "from/to 주소를 이벤트로 남기는 것이 전부이고, 온체인 상태는 저장하지 않는다.",
        "A·B 담당자의 동의는 DB 승인 기록(transfer_history 동반)으로 보존한다."
      ],
      "discriminator": [
        190,
        253,
        87,
        186,
        123,
        174,
        3,
        33
      ],
      "accounts": [
        {
          "name": "from",
          "docs": [
            "기존 담당자 지갑 — 온체인 서명 없음, 이벤트 기록용 주소."
          ]
        },
        {
          "name": "to",
          "docs": [
            "신규 담당자 지갑."
          ]
        },
        {
          "name": "feePayer",
          "docs": [
            "시스템 운영 지갑 — 트랜잭션 수수료 부담. 서버가 보관한 키만 이 계정으로 서명한다."
          ],
          "writable": true,
          "signer": true
        }
      ],
      "args": [
        {
          "name": "assetId",
          "type": "string"
        },
        {
          "name": "assetCode",
          "type": "string"
        }
      ]
    }
  ],
  "events": [
    {
      "name": "handoverCreated",
      "discriminator": [
        108,
        87,
        152,
        119,
        155,
        133,
        200,
        159
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidInput",
      "msg": "asset_id/asset_code는 비어있을 수 없고 64자를 초과할 수 없습니다"
    },
    {
      "code": 6001,
      "name": "sameParty",
      "msg": "인계자와 인수자는 같은 주소일 수 없습니다"
    }
  ],
  "types": [
    {
      "name": "handoverCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "assetId",
            "type": "string"
          },
          {
            "name": "assetCode",
            "type": "string"
          },
          {
            "name": "from",
            "type": "pubkey"
          },
          {
            "name": "to",
            "type": "pubkey"
          },
          {
            "name": "createdTs",
            "type": "i64"
          }
        ]
      }
    }
  ]
};