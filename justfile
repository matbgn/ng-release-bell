# shellcheck disable=SC2148,SC1083

set dotenv-filename := ".env"
set dotenv-load := true

PROJECT_NAME := "ng-release-bell"
PORT := "3000"
VITE_PORT := "5173"

# Development: start backend + Vite dev server
dev:
    #!/usr/bin/env bash
    echo "--- Starting NG Release Bell Development ---"
    echo "[1/2] Starting backend on port 3000..."
    PORT=3000 node index.js &
    BACKEND_PID=$!
    echo "[2/2] Starting Vite dev server on port 5173..."
    npx vite --host &
    VITE_PID=$!
    echo "Backend PID: $BACKEND_PID, Vite PID: $VITE_PID"
    echo "Press Ctrl+C to stop both."
    wait

# Development: backend only (if Vite runs separately)
dev-back:
    PORT=3000 node index.js

# Development: Vite only
dev-front:
    npx vite --host

# Build frontend
build:
    npx vite build

# Code quality check
check:
    @echo "Running build check..."
    npx vite build
    @echo "All checks passed."

# Docker: build and run
docker-build-run:
    @echo "Building and starting {{ PROJECT_NAME }}..."
    docker compose up -d --build

# Docker: run without rebuild
docker-run:
    docker compose up -d

# Docker: logs
docker-logs:
    docker compose logs -f

# Docker: stop and remove
docker-clean:
    docker compose down -v

# Docker: build image only
docker-build:
    docker build -t {{ PROJECT_NAME }}:latest .

# Docker: exec node REPL in running container (distroless has no shell)
docker-exec:
    docker compose exec {{ PROJECT_NAME }} /nodejs/bin/node

# Clean build artifacts
clean:
    rm -rf dist/ node_modules/
    docker compose down -v
