FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY assets ./assets
COPY web ./web
COPY scripts/build.mjs ./scripts/build.mjs
RUN npm run build

FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
COPY scripts/admin.mjs scripts/backup.mjs ./scripts/
RUN mkdir -p /app/data /app/backups && chown -R node:node /app/data /app/backups
USER node
EXPOSE 3000
VOLUME ["/app/data", "/app/backups"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
