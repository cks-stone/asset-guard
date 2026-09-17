use anchor_lang::prelude::*;

declare_id!("5U6NZm5aNtzEeWEdzuZiciRbmFo8wLEzxBfcXnEjgkJ3");

/// 인수인계 상태 (온체인 무결성 증거)
#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Eq, Debug, AnchorSerialize, AnchorDeserialize)]
pub enum HandoverStatus {
    Pending = 0,
    Completed = 1,
    Cancelled = 2,
}

impl Default for HandoverStatus {
    fn default() -> Self {
        HandoverStatus::Pending
    }
}

/// 인수인계 이력 — Supabase(ad-hoc DB)와 달리 관리자도 위조/삭제 불가
#[account]
#[derive(Default)]
pub struct Handover {
    /// Supabase assets.id (uuid) — 온체인 ↔ DB 정합성 검증 키
    pub asset_id: String,
    /// 자산 코드 (예: "RCB-0001")
    pub asset_code: String,
    /// 기존 담당자 (지갑)
    pub from: Pubkey,
    /// 신규 담당자 (지갑)
    pub to: Pubkey,
    /// Pending / Completed / Cancelled
    pub status: HandoverStatus,
    /// create_handover 시각 (unix ts)
    pub created_ts: i64,
    /// accept_handover 시각 (unix ts)
    pub completed_ts: i64,
    pub bump: u8,
}

/// asset_id(uuid, 36자) → sha256 32바이트 시드 (PDA 시드 컴포넌트 최대 32바이트 제약 대응)
#[inline]
fn asset_seed(asset_id: &str) -> Vec<u8> {
    anchor_lang::solana_program::hash::hash(asset_id.as_bytes())
        .to_bytes()
        .to_vec()
}

impl Handover {
    pub const SPACE: usize = 8
        + (4 + 64)  // asset_id
        + (4 + 64)  // asset_code
        + 32        // from
        + 32        // to
        + 1         // status
        + 8         // created_ts
        + 8         // completed_ts
        + 1;        // bump
}

#[event]
pub struct HandoverCreated {
    pub handover: Pubkey,
    pub asset_id: String,
    pub from: Pubkey,
    pub to: Pubkey,
}

#[event]
pub struct HandoverAccepted {
    pub handover: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
}

#[program]
pub mod asset_guard {
    use super::*;

    /// 인계 신청 — 기존 담당자(from)만 서명, 상태 PENDING.
    /// 신규 담당자(to)는 지갑 주소만 지정되며 아직 서명하지 않는다.
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

        let handover = &mut ctx.accounts.handover;
        handover.asset_id = asset_id;
        handover.asset_code = asset_code;
        handover.from = ctx.accounts.from.key();
        handover.to = ctx.accounts.to.key();
        handover.status = HandoverStatus::Pending;
        handover.created_ts = Clock::get()?.unix_timestamp;
        handover.bump = ctx.bumps.handover;

        emit!(HandoverCreated {
            handover: handover.key(),
            asset_id: handover.asset_id.clone(),
            from: handover.from,
            to: handover.to,
        });
        Ok(())
    }

    /// 인수 수락 — 인계자(from)와 인수자(to)가 모두 서명해야만 실제 계약이 진행된다.
    /// (양자 서명 필수: 스펙 "인계자가 먼저 요청, 인수자가 수락해야 계약 진행")
    pub fn accept_handover(ctx: Context<AcceptHandover>) -> Result<()> {
        let handover = &mut ctx.accounts.handover;
        require!(
            handover.status == HandoverStatus::Pending,
            ErrorCode::InvalidStatus
        );
        handover.status = HandoverStatus::Completed;
        handover.completed_ts = Clock::get()?.unix_timestamp;

        emit!(HandoverAccepted {
            handover: handover.key(),
            from: handover.from,
            to: handover.to,
        });
        Ok(())
    }

    /// 인계 취소 — 인계자(from)만 서명, PENDING 상태에서만 가능.
    pub fn cancel_handover(ctx: Context<CancelHandover>) -> Result<()> {
        let handover = &mut ctx.accounts.handover;
        require!(
            handover.status == HandoverStatus::Pending,
            ErrorCode::InvalidStatus
        );
        handover.status = HandoverStatus::Cancelled;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(asset_id: String, asset_code: String)]
pub struct CreateHandover<'info> {
    /// PDA: handover_{asset_id}_{from}_{to}
    #[account(
        init,
        payer = from,
        space = Handover::SPACE,
        seeds = [b"handover".as_ref(), &asset_seed(&asset_id), from.key().as_ref(), to.key().as_ref()],
        bump
    )]
    pub handover: Account<'info, Handover>,
    /// 기존 담당자 — 렌트비(rent) 지불 + create 서명
    #[account(mut)]
    pub from: Signer<'info>,
    /// CHECK:: 신규 담당자 — create 단계에서는 서명 없음. accept_handover에서
    /// `address = handover.to` 제약으로 정합성이 검증됨.
    pub to: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AcceptHandover<'info> {
    #[account(
        mut,
        seeds = [b"handover".as_ref(), &asset_seed(&handover.asset_id), from.key().as_ref(), to.key().as_ref()],
        bump = handover.bump
    )]
    pub handover: Account<'info, Handover>,
    #[account(address = handover.from)]
    pub from: Signer<'info>,
    #[account(address = handover.to)]
    pub to: Signer<'info>,
}

#[derive(Accounts)]
pub struct CancelHandover<'info> {
    #[account(
        mut,
        seeds = [b"handover".as_ref(), &asset_seed(&handover.asset_id), from.key().as_ref(), to.key().as_ref()],
        bump = handover.bump
    )]
    pub handover: Account<'info, Handover>,
    #[account(address = handover.from)]
    pub from: Signer<'info>,
    /// CHECK:: 신규 담당자 — PDA 시드 계산에만 사용. 서명 불필요, address=handover.to 검증 없음.
    pub to: AccountInfo<'info>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("asset_id/asset_code는 비어있을 수 없고 64자를 초과할 수 없습니다")]
    InvalidInput,
    #[msg("인계자와 인수자는 같은 주소일 수 없습니다")]
    SameParty,
    #[msg("PENDING 상태에서만 실행 가능합니다")]
    InvalidStatus,
}