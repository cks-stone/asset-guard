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
      "name": "acceptHandover",
      "docs": [
        "인수 수락 — 인계자(from)와 인수자(to)가 모두 서명해야만 실제 계약이 진행된다.",
        "(양자 서명 필수: 스펙 \"인계자가 먼저 요청, 인수자가 수락해야 계약 진행\")"
      ],
      "discriminator": [
        101,
        53,
        115,
        232,
        181,
        113,
        176,
        70
      ],
      "accounts": [
        {
          "name": "handover",
          "writable": true
        },
        {
          "name": "from",
          "signer": true
        },
        {
          "name": "to",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "cancelHandover",
      "docs": [
        "인계 취소 — 인계자(from)만 서명, PENDING 상태에서만 가능."
      ],
      "discriminator": [
        157,
        127,
        67,
        138,
        98,
        159,
        141,
        52
      ],
      "accounts": [
        {
          "name": "handover",
          "writable": true
        },
        {
          "name": "from",
          "signer": true
        },
        {
          "name": "to"
        }
      ],
      "args": []
    },
    {
      "name": "createHandover",
      "docs": [
        "인계 신청 — 기존 담당자(from)만 서명, 상태 PENDING.",
        "신규 담당자(to)는 지갑 주소만 지정되며 아직 서명하지 않는다."
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
          "name": "handover",
          "docs": [
            "PDA: handover_{asset_id}_{from}_{to}"
          ],
          "writable": true
        },
        {
          "name": "from",
          "docs": [
            "기존 담당자 — 렌트비(rent) 지불 + create 서명"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "to",
          "docs": [
            "`address = handover.to` 제약으로 정합성이 검증됨."
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
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
  "accounts": [
    {
      "name": "handover",
      "discriminator": [
        163,
        138,
        0,
        115,
        160,
        73,
        19,
        135
      ]
    }
  ],
  "events": [
    {
      "name": "handoverAccepted",
      "discriminator": [
        217,
        160,
        163,
        223,
        166,
        103,
        178,
        94
      ]
    },
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
    },
    {
      "code": 6002,
      "name": "invalidStatus",
      "msg": "PENDING 상태에서만 실행 가능합니다"
    }
  ],
  "types": [
    {
      "name": "handover",
      "docs": [
        "인수인계 이력 — Supabase(ad-hoc DB)와 달리 관리자도 위조/삭제 불가"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "assetId",
            "docs": [
              "Supabase assets.id (uuid) — 온체인 ↔ DB 정합성 검증 키"
            ],
            "type": "string"
          },
          {
            "name": "assetCode",
            "docs": [
              "자산 코드 (예: \"RCB-0001\")"
            ],
            "type": "string"
          },
          {
            "name": "from",
            "docs": [
              "기존 담당자 (지갑)"
            ],
            "type": "pubkey"
          },
          {
            "name": "to",
            "docs": [
              "신규 담당자 (지갑)"
            ],
            "type": "pubkey"
          },
          {
            "name": "status",
            "docs": [
              "Pending / Completed / Cancelled"
            ],
            "type": {
              "defined": {
                "name": "handoverStatus"
              }
            }
          },
          {
            "name": "createdTs",
            "docs": [
              "create_handover 시각 (unix ts)"
            ],
            "type": "i64"
          },
          {
            "name": "completedTs",
            "docs": [
              "accept_handover 시각 (unix ts)"
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "handoverAccepted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "handover",
            "type": "pubkey"
          },
          {
            "name": "from",
            "type": "pubkey"
          },
          {
            "name": "to",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "handoverCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "handover",
            "type": "pubkey"
          },
          {
            "name": "assetId",
            "type": "string"
          },
          {
            "name": "from",
            "type": "pubkey"
          },
          {
            "name": "to",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "handoverStatus",
      "docs": [
        "인수인계 상태 (온체인 무결성 증거)"
      ],
      "repr": {
        "kind": "rust"
      },
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pending"
          },
          {
            "name": "completed"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    }
  ]
};
