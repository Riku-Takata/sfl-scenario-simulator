FROM node:24.14.0-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

FROM node:24.14.0-bookworm-slim AS builder
WORKDIR /app
ENV ASTRO_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24.14.0-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs astro
COPY --from=builder --chown=astro:nodejs /app/dist ./dist
COPY --from=builder --chown=astro:nodejs /app/scripts/serve-static.mjs ./scripts/serve-static.mjs
USER astro
EXPOSE 3000
CMD ["node", "scripts/serve-static.mjs"]
