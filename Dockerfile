# PLAYZO production image: one Node process serving the built app, the API and WebSockets.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
ARG PLAYZO_PUBLIC_URL
ENV PLAYZO_PUBLIC_URL=$PLAYZO_PUBLIC_URL
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PLAYZO_HOST=0.0.0.0 PLAYZO_API_PORT=8080 PLAYZO_DB_PATH=/data/playzo.db
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && mkdir -p /data && chown node:node /data
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD ["node", "-e", "fetch('http://127.0.0.1:8080/api/health').then(r=>r.json()).then(j=>process.exit(j.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "--import", "tsx", "server/index.ts"]
