FROM node:24-bookworm-slim
RUN corepack enable && corepack prepare pnpm@12.4.1 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/evidence/package.json packages/evidence/package.json
COPY packages/reputation/package.json packages/reputation/package.json
RUN pnpm install --frozen-lockfile --filter @milestonepay/api --filter @milestonepay/contracts --filter @milestonepay/evidence --filter @milestonepay/reputation
COPY apps/api apps/api
COPY packages/contracts packages/contracts
COPY packages/evidence packages/evidence
COPY packages/reputation packages/reputation
RUN pnpm --filter @milestonepay/evidence build && pnpm --filter @milestonepay/reputation build
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["pnpm", "dev"]
