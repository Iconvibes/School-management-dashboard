# ---- build stage ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
# Standalone output is required (see next.config.mjs) for a self-contained image.
RUN npm run build

# ---- run stage ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# One instance runs the background jobs (conflict scan + deletion sweeper);
# every other instance sets RUN_JOBS=none (see src/instrumentation.js).
ENV RUN_JOBS=primary
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
USER node
CMD ["node", "server.js"]
