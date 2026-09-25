FROM node:22-bookworm

# Herramientas básicas + postgresql-client para conectarse al contenedor postgres16
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# pnpm vía corepack (versión fija, igual que la que genera el lockfile en el repo)
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

# Workspace
WORKDIR /workspace
RUN chown -R node:node /workspace

USER node