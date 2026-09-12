# MilestonePay

Trustless milestone-based escrow with private evidence and verifiable reputation.

MilestonePay currently includes the core ERC-20 milestone escrow happy path, a React home page, and Fastify health endpoints. Wallet integration, disputes, reputation, and evidence flows are not implemented.

## Requirements

- Docker and Docker Compose v2+
- pnpm 12.4.1 and Node.js 24 LTS for development outside Docker
- [Foundry](https://getfoundry.sh/getting-started/installation) for contract commands

## Local setup

```bash
cp .env.example .env
docker compose up
```

Frontend → http://localhost:5173

Backend → http://localhost:3001 (`GET /health` returns `{"status":"ok"}`)

Arkiv connectivity → http://localhost:3001/arkiv/health

Compose builds the images and installs dependencies automatically. Only `web` and `api` run. The page polls backend health every five seconds. Source edits reload both applications; Vite uses polling for Docker bind mounts. Rebuild with `docker compose up --build` after dependency changes. Stop with Ctrl+C or `docker compose down`.

For development without Docker (stop Compose first):

```bash
pnpm install
pnpm dev
```

Both applications read the root `.env`. `pnpm build`, `pnpm lint`, and `pnpm test` run workspace checks. The root test command runs the API smoke test; Foundry tests are separate.

## Contracts

After cloning, initialize the pinned Foundry dependencies (or clone with `--recurse-submodules`):

```bash
git submodule update --init --recursive
cd contracts
forge build
forge test
```

`src/MilestoneEscrow.sol` implements full upfront funding and client-approved milestone releases. `src/EscrowFactory.sol` deploys agreements using the caller as client. OpenZeppelin Contracts and forge-std are installed as Git submodules. No contract is deployed.

## Layout

- `apps/web`: Vite, React, TypeScript, React Router, Tailwind, and the generated shadcn preset. TanStack Query handles health; wagmi and viem support future wallet work; Swarm ID initializes its authentication iframe.
- `apps/api`: strict TypeScript Fastify server with local CORS, graceful shutdown, and backend-only Arkiv SDK clients.
- `contracts`: Foundry sources, tests, scripts, and dependencies.
- `packages/shared`: reserved shared types/utilities.
- `packages/contracts`: reserved generated ABI/address artifacts.
- `packages/reputation`: reserved deterministic reputation algorithm.

The home route lives in `apps/web/src/routes/home.tsx`; future routes can be added in `App.tsx` for `/dashboard`, `/create`, `/deal/:address`, and `/reputation/:address`.

Frontend initialized with exactly:

```bash
pnpm dlx shadcn@latest init --preset bOMBne8iA --template vite
```

## Environment and security

Copy `.env.example`; do not commit `.env`. All `VITE_` values are public browser configuration, including the Swarm ID and optional subsidised gateway URLs. Arkiv access and private keys plus `AI_API_KEY` are backend-only: Compose passes only the listed public variables to the web container, and excludes environment files from image builds. Never prefix a secret with `VITE_`. `ARKIV_RPC` defaults to Tiramisu; set `ARKIV_ACCESS_KEY` for higher rate limits and a funded `0x` `ARKIV_PRIVATE_KEY` only when writes are implemented.

`PORT` defaults to 3001; Compose keeps the backend host port at 3001. `CORS_ORIGIN` defaults to `http://localhost:5173`. When running without Docker, changing `PORT` also requires updating `VITE_API_URL`. Restart services after changing environment values.

## Planned architecture — not implemented

- Avalanche → escrow and settlement
- Swarm → Swarm ID authentication is configured; encrypted evidence flows are planned
- Arkiv → SDK connectivity is configured; protocol/reputation data models are planned
- AI → reputation explanations and risk analysis

Next: generate ABI/address artifacts, then add wallet connection and deal routes. Disputes, external services, and reputation logic follow later.
