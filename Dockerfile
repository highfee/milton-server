# ─── Stage 1: Install dependencies ───────────────────────────────────────────
FROM node:20-slim AS deps

# Required for Prisma
RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy manifests first for better layer caching
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile

# ─── Stage 2: Production image ────────────────────────────────────────────────
FROM node:20-slim AS runner

RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

# Install pnpm in runner too
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy node_modules and source from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma

# Copy application source
COPY . .

# Generate Prisma client from schema
RUN pnpm exec prisma generate --schema=prisma/schema.prisma

# HuggingFace Spaces exposes port 7860
ENV PORT=7860
EXPOSE 7860

# Startup: push schema then start server
CMD ["sh", "-c", "pnpm exec prisma db push --schema=prisma/schema.prisma --skip-generate && node index.js"]
