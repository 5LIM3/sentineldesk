# Build stage: compile TypeScript with the dev dependencies
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: better-sqlite3 ships a prebuilt binary, so nothing needs compiling
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts

# Run stage: compiled code + production dependencies only, as a non-root user
FROM node:22-slim
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/sentineldesk.db
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
# The SQLite file lives in /data: mount a volume there or the data is lost when the container is removed
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# JWT_SECRET must be provided at run time (never baked into the image)
CMD ["node", "dist/server.js"]
