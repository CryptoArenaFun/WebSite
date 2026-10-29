# ADR 0001: React/Vite frontend on Cloudflare Workers

- Status: Accepted for preview
- Date: 2026-10-30

## Context
The project needs a fast, maintainable, responsive public web frontend with a low-operations hosting model and CI-gated releases.

## Decision
Use React + TypeScript + Vite for the frontend and Cloudflare Workers Static Assets for hosting. Keep the deployment configuration in version control. Changes go through pull requests and CI.

## Consequences
The site can be statically built and deployed without an application server. Blockchain execution, oracle ingestion and authoritative settlement must be implemented separately. Static hosting does not imply the platform is safe for real-money usage.
