# shellcheck disable=SC2148,SC1083,SC1089

set dotenv-filename := ".env"
set dotenv-load := true

PROJECT_NAME := "ng-release-bell"
DOCKER_IMAGE_NAME := "matbgn/ng-release-bell"
PORT := "3000"
VITE_PORT := "5173"

# Check for environment variable presence
_check-env var:
    #!/usr/bin/env bash
    if [ -z "${var}" ]; then
        echo "Error: ${var} environment variable is not set" >&2
        exit 1
    fi

# --- Development Task ---
# Starts the development environment
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

# Code quality check
check:
    @echo "Running build check..."
    npx vite build
    @echo "All checks passed."
    just check-node-versions

# --- Version Management Tasks ---
sync-versions version:
    #!/usr/bin/env bash
    echo "{{version}}" > VERSION
    # add it to package.json
    jq --arg version "{{version}}" '.version = $version' package.json > tmp.json && mv tmp.json package.json

    if [ -z "$(git status --porcelain VERSION package.json)" ]; then
        echo "No changes in VERSION or package.json, skipping commit."
        exit 0
    fi
    git add VERSION package.json
    git commit -m "ci: bump ng-release-bell to v{{version}}"

# --- Changelog Generation Tasks ---
changelog:
    #!/bin/bash
    # if on main or master, exit
    if [ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || [ "$(git rev-parse --abbrev-ref HEAD)" = "master" ]; then
        echo "You are on main branch, you should be on another branch"
        exit 1
    fi
    git-sv cgl --add-next-version > CHANGELOG.md
    if [ -n "$(git status --porcelain CHANGELOG.md)" ]; then
        git add CHANGELOG.md
        git commit -m "chore: update CHANGELOG.md to $(git-sv nv)"
        if [ -z "$(git rev-parse --abbrev-ref '@{upstream}')" ]; then
            git push --set-upstream origin "$(git rev-parse --abbrev-ref HEAD)"
        else
            git push
        fi
    fi

docker-build version="$(git-sv cv)":
    #!/usr/bin/env bash
    echo "Using version: {{version}}"
    set -e
    echo "Creating tar files for deployment..."
    mkdir -p ~/Dev/itpark/infrastructure-as-code/ansible/dist/

    echo "Building {{DOCKER_IMAGE_NAME}} docker image with version {{version}}..."

    LAST_NGRB_HASH="$(docker images --format '{{{{.ID}}' '{{DOCKER_IMAGE_NAME}}')"
    echo "Last {{DOCKER_IMAGE_NAME}} hash: $LAST_NGRB_HASH"
    LAST_NGRB_VERSION="$(docker images --format '{{{{.Tag}}' '{{DOCKER_IMAGE_NAME}}' | sort -V | tail -n 1)"
    echo "Last {{DOCKER_IMAGE_NAME}} version: $LAST_NGRB_VERSION"

    # Build with version tag
    docker build -t "{{DOCKER_IMAGE_NAME}}":"{{version}}" .

    NGRB_CHANGED="$(docker images --format '{{{{.ID}}' '{{DOCKER_IMAGE_NAME}}')"
    echo "New {{DOCKER_IMAGE_NAME}} hash: $NGRB_CHANGED"
    if [ "$LAST_NGRB_HASH" != "$NGRB_CHANGED" ] || [ "$LAST_NGRB_VERSION" != "{{version}}" ]; then
        echo "Tagging {{DOCKER_IMAGE_NAME}} docker image with version {{version}}..."
        docker tag "{{DOCKER_IMAGE_NAME}}":"{{version}}" "{{DOCKER_IMAGE_NAME}}:latest"
        echo "Saving {{DOCKER_IMAGE_NAME}} docker image to tar file..."
        docker save -o ~/Dev/itpark/infrastructure-as-code/ansible/dist/ng-release-bell.tar "{{DOCKER_IMAGE_NAME}}":"{{version}}"
        echo "Tar file created successfully: ~/Dev/itpark/infrastructure-as-code/ansible/dist/ng-release-bell.tar"
    else
        echo "{{DOCKER_IMAGE_NAME}} docker image has not changed"
    fi

# --- Docker Compose Run Task (with build) ---
docker-build-run:
    @echo "Building and starting {{PROJECT_NAME}}..."
    docker compose up -d --build

# --- Docker Compose Run Task ---
docker-run:
    @echo "Starting {{PROJECT_NAME}}..."
    docker compose up -d

# --- Docker Compose Logs Task ---
docker-logs:
    docker compose logs -f

# Docker: exec node REPL in running container (distroless has no shell)
docker-exec:
    docker compose exec {{PROJECT_NAME}} /nodejs/bin/node

# --- Docker Compose Clean Task ---
docker-clean:
    @echo "Cleaning up {{PROJECT_NAME}} stack..."
    docker compose down -v

# --- Production Deployment Tasks ---
prod-push host='bqn-vmg-102': _check-BW_SESSION
    @echo "Pushing {{PROJECT_NAME}} to production host {{host}}..."
    ansible-playbook -i ~/Dev/itpark/infrastructure-as-code/ansible/inventory ~/Dev/itpark/infrastructure-as-code/ansible/playbook-deploy-docker.yml -t push -e "docker_project_to_deploy={{PROJECT_NAME}}" --limit "{{host}}"

prod-load host='bqn-vmg-102': _check-BW_SESSION
    @echo "Loading {{PROJECT_NAME}} on production host {{host}}..."
    ansible-playbook -i ~/Dev/itpark/infrastructure-as-code/ansible/inventory ~/Dev/itpark/infrastructure-as-code/ansible/playbook-deploy-docker.yml -t load -e "docker_project_to_deploy={{PROJECT_NAME}}" --limit "{{host}}"

prod-restart host='bqn-vmg-102': _check-BW_SESSION
    @echo "Restarting {{PROJECT_NAME}} on production host {{host}}..."
    ansible-playbook -i ~/Dev/itpark/infrastructure-as-code/ansible/inventory ~/Dev/itpark/infrastructure-as-code/ansible/playbook-deploy-docker.yml -t restart -e "docker_project_to_deploy={{PROJECT_NAME}}" --limit "{{host}}"

prod-stop host='bqn-vmg-102': _check-BW_SESSION
    @echo "Stopping {{PROJECT_NAME}} on production host {{host}}..."
    ansible-playbook -i ~/Dev/itpark/infrastructure-as-code/ansible/inventory ~/Dev/itpark/infrastructure-as-code/ansible/playbook-deploy-docker.yml -t stop -e "docker_project_to_deploy={{PROJECT_NAME}}" --limit "{{host}}"

prod-status host='bqn-vmg-102': _check-BW_SESSION
    @echo "Checking {{PROJECT_NAME}} status on production host {{host}}..."
    ansible-playbook -i ~/Dev/itpark/infrastructure-as-code/ansible/inventory ~/Dev/itpark/infrastructure-as-code/ansible/playbook-deploy-docker.yml -t status -e "docker_project_to_deploy={{PROJECT_NAME}}" --limit "{{host}}"

# --- Full Deploy Task ---
deploy host='bqn-vmg-102': _check-BW_SESSION docker-build
    @echo "Full deployment of {{PROJECT_NAME}} on {{host}}..."
    ansible-playbook -i ~/Dev/itpark/infrastructure-as-code/ansible/inventory ~/Dev/itpark/infrastructure-as-code/ansible/playbook-deploy-docker.yml -e "docker_project_to_deploy={{PROJECT_NAME}}" --limit "{{host}}"
    just finish

# --- Deploy with version ---
deploy-version version host='bqn-vmg-102': _check-BW_SESSION
    #!/usr/bin/env bash
    VERSION="{{version}}"
    just sync-versions "$VERSION"
    just docker-build "$VERSION"
    ansible-playbook -i ~/Dev/itpark/infrastructure-as-code/ansible/inventory ~/Dev/itpark/infrastructure-as-code/ansible/playbook-deploy-docker.yml -e "docker_project_to_deploy={{PROJECT_NAME}}" --limit "{{host}}"
    just finish

# --- Release Task (Complete Release Workflow) ---
release:
    #!/bin/bash
    # if on main or master, exit
    if [ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || [ "$(git rev-parse --abbrev-ref HEAD)" = "master" ]; then
        echo "You are on main branch, you should be on another branch"
        exit 1
    fi
    VERSION=$(git-sv nv)
    just sync-versions "$VERSION"
    just changelog
    just create-github-release "$VERSION"
    git pull

create-github-release version:
    #!/bin/bash
    if [ "{{version}}" != "$(git-sv rn)" ]; then
        echo "Creating new release {{version}}"
        NOTES_FILE=$(mktemp)
        git-sv rn > "$NOTES_FILE"
        gcli -t github releases create -t "{{version}}" -c "$(git rev-parse --abbrev-ref HEAD)" -T "$NOTES_FILE"
    fi

# --- Check if BW_SESSION is set (for production tasks) ---
@_check-BW_SESSION:
    if [ -z "${BW_SESSION}" ]; then \
        echo "Error: BW_SESSION is not set. This is required for production deployment." >&2; \
        echo "Please ensure you have Bitwarden CLI configured and logged in." >&2; \
        exit 1; \
    fi

# --- Utility Tasks ---
build:
    @echo "Building {{PROJECT_NAME}}..."
    npm run build

install:
    @echo "Installing dependencies..."
    npm install

clean:
    @echo "Cleaning up build artifacts and Docker resources..."
    rm -rf dist/
    rm -rf node_modules/
    docker compose down -v

# --- Completion Message ---
finish:
    @echo
    @echo "---------------------------------"
    @echo "DEPLOY FINISHED!"
    @echo "---------------------------------"
    @echo

# --- Hardware Key Interaction for Security ---
hwkey-interaction:
    @echo
    @echo "---------------------------------"
    @echo "INTERACT WITH YOUR HW CRYPTO KEY!"
    @echo "---------------------------------"
    @echo

# --- Show current versions ---
version:
    @echo "Current git-sv version (current): $(git-sv cv)"
    @echo "Next git-sv version (next): $(git-sv nv)"
    @if [ -f VERSION ]; then echo "Local VERSION file: $(cat VERSION)"; fi
    @echo "package.json version: $(jq -r '.version' package.json)"

# --- Check that Node versions are aligned across all config files ---
check-versions:
    #!/usr/bin/env bash
    set -euo pipefail
    errors=0

    echo "Checking version alignment across .tool-versions, package.json, and Dockerfile..."

    # --- Node.js ---
    node_tool=$(grep '^nodejs' .tool-versions | awk '{print $2}')
    node_pkg=$(jq -r '.engines.node // empty' package.json 2>/dev/null || true)
    node_docker=$(grep -oP 'FROM node:\K[0-9]+' Dockerfile | head -1)

    echo "  .tool-versions  node: $node_tool"
    echo "  package.json     node: ${node_pkg:-<not set>}"
    echo "  Dockerfile       node: $node_docker"

    node_major_tool="${node_tool%%.*}"
    if [ "$node_major_tool" != "$node_docker" ]; then
        echo "  ERROR: .tool-versions node major ($node_major_tool) != Dockerfile ($node_docker)" >&2
        errors=$((errors + 1))
    fi
    if [ -n "$node_pkg" ]; then
        node_pkg_major=$(echo "$node_pkg" | grep -oP '[0-9]+' | head -1)
        if [ "$node_major_tool" != "$node_pkg_major" ]; then
            echo "  ERROR: .tool-versions node major ($node_major_tool) != package.json engines ($node_pkg)" >&2
            errors=$((errors + 1))
        fi
    fi

    if [ "$errors" -eq 0 ]; then
        echo "All versions are aligned."
    else
        echo "$errors error(s) found." >&2
        exit 1
    fi