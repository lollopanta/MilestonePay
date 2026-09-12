FROM node:24-bookworm-slim
RUN npm install --global pnpm@12.4.1
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile --filter @milestonepay/web
COPY apps/web apps/web
COPY packages/contracts packages/contracts
WORKDIR /app/apps/web
EXPOSE 5173
CMD ["pnpm", "dev"]
