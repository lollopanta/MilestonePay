FROM node:24-bookworm-slim
RUN corepack enable && corepack prepare pnpm@12.4.1 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/evidence/package.json packages/evidence/package.json
RUN pnpm install --frozen-lockfile --filter @milestonepay/web --filter @milestonepay/evidence
COPY apps/web apps/web
COPY packages/contracts packages/contracts
COPY packages/evidence packages/evidence
RUN pnpm --filter @milestonepay/evidence build
WORKDIR /app/apps/web
EXPOSE 5173
CMD ["pnpm", "dev"]
