# Release images are built locally/CI, never on the shared ECS. Secrets are mounted only at runtime.
FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS api-deps
WORKDIR /app
ENV NODE_ENV=production NODE_OPTIONS=--max-old-space-size=128
COPY package.json package-lock.json ./
COPY apps/worker/package.json ./apps/worker/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/sound-rules/package.json ./packages/sound-rules/package.json
COPY packages/audio-engine/package.json ./packages/audio-engine/package.json
COPY packages/prompts/package.json ./packages/prompts/package.json
COPY packages/music-features/package.json ./packages/music-features/package.json
RUN npm ci --omit=dev --ignore-scripts --workspace=@wanwu-v2/api --include-workspace-root=false --no-audit --no-fund

FROM api-deps AS api
ARG WANWU_BUILD_COMMIT=unknown
ARG WANWU_BUILD_SOURCE_DIGEST=unknown
ARG WANWU_BUILD_DIRTY=true
ENV WANWU_BUILD_COMMIT=$WANWU_BUILD_COMMIT WANWU_BUILD_SOURCE_DIGEST=$WANWU_BUILD_SOURCE_DIGEST WANWU_BUILD_DIRTY=$WANWU_BUILD_DIRTY
LABEL ink.proterm.wanwu.source=$WANWU_BUILD_SOURCE_DIGEST org.opencontainers.image.revision=$WANWU_BUILD_COMMIT
COPY apps/api/src ./apps/api/src
COPY apps/api/migrations ./apps/api/migrations
COPY data/catalogue ./data/catalogue
COPY packages/contracts ./packages/contracts
COPY packages/sound-rules ./packages/sound-rules
COPY packages/audio-engine ./packages/audio-engine
COPY packages/prompts ./packages/prompts
COPY packages/music-features ./packages/music-features
USER 1000:1000
CMD ["node","apps/api/src/main.ts"]

FROM api-deps AS worker-deps
RUN npm ci --omit=dev --ignore-scripts --workspace=@wanwu-v2/worker --workspace=@wanwu-v2/api --include-workspace-root=false --no-audit --no-fund

FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS media-tools
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NODE_OPTIONS=--max-old-space-size=128 \
    WANWU_CONTAINER_TEST=1
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates
RUN npx --yes --package=playwright@1.64.1 playwright install --with-deps --no-shell chromium
FROM media-tools AS worker
ARG WANWU_BUILD_COMMIT=unknown
ARG WANWU_BUILD_SOURCE_DIGEST=unknown
ARG WANWU_BUILD_DIRTY=true
ENV WANWU_BUILD_COMMIT=$WANWU_BUILD_COMMIT WANWU_BUILD_SOURCE_DIGEST=$WANWU_BUILD_SOURCE_DIGEST WANWU_BUILD_DIRTY=$WANWU_BUILD_DIRTY
LABEL ink.proterm.wanwu.source=$WANWU_BUILD_SOURCE_DIGEST org.opencontainers.image.revision=$WANWU_BUILD_COMMIT
ENV NODE_ENV=production WANWU_CONTAINER_TEST=""
COPY --from=worker-deps /app/node_modules ./node_modules
COPY --from=worker-deps /app/package.json ./package.json
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
COPY packages/contracts ./packages/contracts
COPY packages/sound-rules ./packages/sound-rules
COPY packages/audio-engine ./packages/audio-engine
COPY packages/prompts ./packages/prompts
COPY packages/music-features ./packages/music-features
COPY data/catalogue ./data/catalogue
RUN mkdir -p /var/lib/wanwu-media && chown 1000:1000 /var/lib/wanwu-media
USER 1000:1000
CMD ["node","--expose-gc","apps/worker/src/main.ts"]

FROM postgres@sha256:858bb5e98eed02eb8cafbcdc007f9a65d1b613972028944a8ec2133ccaf80d27 AS ops
ARG WANWU_BUILD_COMMIT=unknown
ARG WANWU_BUILD_SOURCE_DIGEST=unknown
ARG WANWU_BUILD_DIRTY=true
ENV WANWU_BUILD_COMMIT=$WANWU_BUILD_COMMIT WANWU_BUILD_SOURCE_DIGEST=$WANWU_BUILD_SOURCE_DIGEST WANWU_BUILD_DIRTY=$WANWU_BUILD_DIRTY
LABEL ink.proterm.wanwu.source=$WANWU_BUILD_SOURCE_DIGEST org.opencontainers.image.revision=$WANWU_BUILD_COMMIT
WORKDIR /app
ENV NODE_ENV=production NODE_OPTIONS=--max-old-space-size=128
COPY --from=api /usr/local/bin/node /usr/local/bin/node
COPY --from=api /app /app
USER 1000:1000
ENTRYPOINT ["node"]
CMD ["apps/api/src/maintenance/backup-cli.ts"]

FROM ops AS catalogue
COPY assets-source/audio ./assets-source/audio
CMD ["apps/api/src/catalogue-cli.ts"]

FROM ops AS ops-test
COPY apps/api/tests ./apps/api/tests
CMD ["--test","apps/api/tests/integration/operations.test.ts"]

FROM worker AS worker-test
CMD ["node","--expose-gc","--test","--test-isolation=none","apps/worker/tests/runtime/media-runtime.test.ts"]
