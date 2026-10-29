# Architecture

## Scope
This repository is the **public frontend preview** for CryptoArena.fun. It is not a deployed prediction-market protocol. All market prices are placeholders and the direction buttons are disabled.

## Components
- React 19 and TypeScript: UI and type checking.
- Vite: local development and static production build (`dist/`).
- Cloudflare Workers Static Assets: host the compiled site via `wrangler.jsonc`.
- GitHub Actions: lint and production build on PRs and main pushes.

## Trust boundaries
Browser inputs, wallet responses, market data, and oracle reports are untrusted. No secret, settlement authority, private key or payout calculation should reside in the browser. Real-money features require separately reviewed smart contracts, oracle design, threat model, independent testing and jurisdictional legal review before enablement.

## Planned modules (not implemented)
- Wallet connection and chain/network validation
- On-chain round state and verifiable resolution
- Indexing and event synchronization
- Read-only price display with timestamp/staleness indicator
- Transaction state handling and error recovery

## Design principles
Keep the frontend stateless where practical; isolate blockchain adapters from presentation; use deterministic tests for financial math; never trust UI-only limits; do not expose real-money actions until all dependencies are production-ready.
