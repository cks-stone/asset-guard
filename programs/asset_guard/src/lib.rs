use anchor_lang::prelude::*;

declare_id!("5U6NZm5aNtzEeWEdzuZiciRbmFo8wLEzxBfcXnEjgkJ3");

/// 인수인계 사실 증거 — 자산당 PDA 계정을 만들지 않고 이벤트 로그로만 기록한다.
/// (구) PDA 계정: 자산당 렌트 면제 예치금(1,798,320 lamports)이 발생, mainnet에서
/// 자산 수·이관 수만큼 잠금이 누적되는 구조였다.
/// (신) 무계정(account-less) 설계:
///   - On-chain 증거 = 트랜잭션 서명 + HandoverCreated 이벤트 로그 (탐색기에서 영구 조회).
///   - 전체 이력(시간순)·담당자 동의 타임스탬프는 DB transfer_history가 보관.
///   - 비용 = 트랜잭션 수수료(5,000 lamports)뿐, 렌트 예치 0.
#[event]
pub struct HandoverCreated {
    pub asset_id: String,
    pub asset_code: String,
    pub from: Pubkey,
    pub to: Pubkey,
    pub created_ts: i64,
}

#[program]
pub mod asset_guard {
    use super::*;

    /// 이관 확정 — 관리자(서비스 지갑)가 승인 시점에 단독 실행.
    /// from/to 주소를 이벤트로 남기는 것이 전부이고, 온체인 상태는 저장하지 않는다.
    /// A·B 담당자의 동의는 DB 승인 기록(transfer_history 동반)으로 보존한다.
    pub fn create_handover(
        ctx: Context<CreateHandover>,
        asset_id: String,
        asset_code: String,
    ) -> Result<()> {
        require!(
            !asset_id.is_empty() && asset_id.len() <= 64 && !asset_code.is_empty() && asset_code.len() <= 64,
            ErrorCode::InvalidInput
        );
        require_keys_neq!(
            ctx.accounts.from.key(),
            ctx.accounts.to.key(),
            ErrorCode::SameParty
        );

        emit!(HandoverCreated {
            asset_id: asset_id.clone(),
            asset_code: asset_code.clone(),
            from: ctx.accounts.from.key(),
            to: ctx.accounts.to.key(),
            created_ts: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateHandover<'info> {
    /// CHECK: 기존 담당자 지갑 — 온체인 서명 없음, 이벤트 기록용 주소.
    pub from: AccountInfo<'info>,
    /// CHECK: 신규 담당자 지갑.
    pub to: AccountInfo<'info>,
    /// 시스템 운영 지갑 — 트랜잭션 수수료 부담. 서버가 보관한 키만 이 계정으로 서명한다.
    #[account(mut)]
    pub fee_payer: Signer<'info>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("asset_id/asset_code는 비어있을 수 없고 64자를 초과할 수 없습니다")]
    InvalidInput,
    #[msg("인계자와 인수자는 같은 주소일 수 없습니다")]
    SameParty,
}