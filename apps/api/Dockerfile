FROM node:24-bookworm-slim
RUN corepack enable && corepack prepare pnpm@12.4.1 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @milestonepay/api
COPY apps/api apps/api
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["pnpm", "dev"]
