# La imagen que va a correr en ECS. No es la del devcontainer: ahí se instala de todo
# para que se pueda trabajar, y aquí solo lo que hace falta para arrancar.
#
# Dos etapas a propósito. La primera instala las dependencias de desarrollo, compila y
# se descarta entera. La segunda solo recibe el código compilado y las dependencias de
# producción, así que la imagen final no lleva ni el compilador ni las dependencias de
# pruebas: menos superficie, y menos cosas que se puedan pisar por accidente.
#
# El código es CommonJS (no hay "type": "module" en el package.json), así que
# `__dirname` funciona en lo compilado y las migraciones se encuentran en
# `dist/migrations`. Si algún día el proyecto pasa a ESM, el glob de migraciones ya
# tiene el segundo origen para eso, pero esta imagen tiene que seguir copiando `dist`
# entero.

# ---------------------------------------------------------------------------------------
# Etapa 1: compilar
# ---------------------------------------------------------------------------------------
FROM node:22-bookworm AS compilacion

# pnpm con la versión fijada en el package.json. Sin `corepack enable` antes, la versión
# sale de la última publicada y el `pnpm install` falla en cuanto el lockfile no coincide.
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

# Primero solo los manifiestos: mientras no cambien, la capa de dependencias se
# reutiliza y no se reinstala todo en cada cambio de código.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN pnpm build

# Las dependencias de producción, en una etapa aparte para no arrastrar las de
# desarrollo. `pnpm deploy` es lo que copia el node_modules ya reducido a su sitio.
RUN pnpm install --frozen-lockfile --prod

# ---------------------------------------------------------------------------------------
# Etapa 2: ejecutar
# ---------------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS ejecucion

# `tini` como PID 1. Sin él, el proceso de Node es el PID 1 y las señales de parada de
# ECS no llegan a tiempo: el contenedor tarda diez segundos en apagarse y el
# despliegue se queda esperando. `dumb-init` o `tini` resuelven esto; `tini` pesa menos.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
# Que Node avise de las promesas sin capturar. Sin esto, un rechazo sin `catch` tumba
# el proceso sin dejar rastro en el registro, y el balanceador solo ve que el
# contenedor dejó de responder.
ENV NODE_OPTIONS=--unhandled-rejections=throw

COPY --from=compilacion /app/node_modules ./node_modules
COPY --from=compilacion /app/dist ./dist
COPY package.json ./

# Sin usuario root. La imagen base trae `node`, y basta.
USER node

EXPOSE 8000

# El balanceador ya tiene su propia comprobación; esta es para cuando alguien levanta
# el contenedor a mano y quiere saber si sirve. Va con el propio Node porque la imagen
# no trae `curl` ni `wget`, y meterlos solo para esto añade una capa por nada.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
