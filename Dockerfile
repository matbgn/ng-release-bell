# Stage 1: Build the application
FROM node:26-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && \
    rm -rf node_modules && \
    npm install --omit=dev && \
    npm cache clean --force

# Stage 2: Create data directory (distroless has no shell)
FROM node:26-slim AS prep
RUN mkdir -p /home/nonroot/data && chown -R 65532:65532 /home/nonroot

# Stage 3: Create the runtime image (distroless, nonroot)
FROM gcr.io/distroless/nodejs26-debian13:nonroot

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/home/nonroot/data/ng-release-bell.db
ENV DATA_DIR=/home/nonroot/data

COPY --chown=nonroot:nonroot --from=build /app/dist ./dist
COPY --chown=nonroot:nonroot --from=build /app/node_modules ./node_modules
COPY --chown=nonroot:nonroot --from=build /app/package*.json ./
COPY --chown=nonroot:nonroot --from=build /app/backend ./backend
COPY --chown=nonroot:nonroot --from=build /app/migrations ./migrations
COPY --chown=nonroot:nonroot --from=build /app/public ./public
COPY --chown=nonroot:nonroot --from=build /app/index.js ./
COPY --chown=nonroot:nonroot --from=build /app/index.html ./
COPY --chown=nonroot:nonroot --from=build /app/vite.config.mjs ./
COPY --chown=nonroot:nonroot --from=prep /home/nonroot /home/nonroot

USER nonroot:nonroot

EXPOSE 3000

CMD ["index.js"]