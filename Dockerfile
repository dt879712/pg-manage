FROM node:22-slim

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Apply pending database migrations, then start the API.
# Migrations are best-effort: if they fail, the API still starts (never crash-loops).
CMD ["sh", "-c", "npx prisma migrate deploy || echo '[startup] migrate deploy failed - starting API anyway'; exec node dist/index.js"]
