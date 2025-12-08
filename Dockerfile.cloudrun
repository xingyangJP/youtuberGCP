# Cloud Run 用の暫定 Dockerfile 雛形
# - 現行コードは Cloudflare Pages Functions 前提。Firestore 対応と Node ハンドラ移植後に CMD を差し替えること。
# - ポートは Cloud Run が提供する $PORT を使用。

FROM node:20-slim AS builder
WORKDIR /app

# 依存関係インストール
COPY package*.json ./
RUN npm ci

# アプリソースをコピーしてビルド
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app

# 必要に応じて devDependencies を含める（wrangler を runtime で使うため）
COPY --from=builder /app ./

ENV NODE_ENV=production
ENV PORT=8080

# 現状は Pages Functions ビルドを wrangler dev で立ち上げる暫定CMD
# Firestore対応のNodeサーバを用意でき次第、`node dist/server.js` 等に置き換えること。
CMD ["npm", "run", "start:cloudrun"]
