FROM node:24.14.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
COPY dist ./dist
COPY runtime/serve-static.mjs ./scripts/serve-static.mjs
USER node
EXPOSE 3000
CMD ["node", "scripts/serve-static.mjs"]
