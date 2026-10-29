# Security baseline

## Current exposure
This is a non-transactional preview. No wallet signatures, on-chain writes, custody or real-money rounds are implemented.

## Requirements before financial functionality
- Define round lifecycle and invariants (entry, lock, resolve, claim, refund, cancellation).
- Specify oracle provenance, stale prices, tie rules, precision, timing and manipulation resistance.
- Test economic invariants: pool conservation, fee bounds, no double claims, refunds, rounding and reentrancy.
- Use independently audited contracts and verify deployment bytecode and chain IDs.
- Add rate limits and abuse monitoring without relying on client-only enforcement.
- Implement transaction simulations, user-visible approvals, and clear error states.
- Complete legal/regulatory review for applicable markets and user jurisdictions.

## Secrets
Never commit seed phrases, private keys, API credentials or Cloudflare tokens. Store deploy credentials in scoped secret stores and rotate if exposed.

## Incident handling
Disable new transactional actions, preserve logs without exposing personal information, publish a status update, identify affected deployments, and document remediation and rollback.
