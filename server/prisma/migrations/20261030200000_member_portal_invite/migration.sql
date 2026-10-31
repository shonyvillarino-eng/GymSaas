-- Member portal access: a single-use invitation token for an existing member account.
-- Additive only: existing token types keep working unchanged.
ALTER TYPE "AuthTokenType" ADD VALUE IF NOT EXISTS 'MEMBER_INVITE';
