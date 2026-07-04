# HookKit Inspector — USER-self-hosted image. HookKit never operates a server.
# Build from the package dir AFTER `pnpm build` (dist/ and dist-ui/ present):
#   pnpm --filter @hookkit-dev/inspector build
#   docker build -t hookkit-inspector packages/inspector
#
# Run (auth is REQUIRED because the container binds 0.0.0.0):
#   docker run -p 4000:4000 -e HOOKKIT_INSPECTOR_AUTH=user:change-me \
#     -v hookkit-data:/data hookkit-inspector
FROM node:20-alpine

WORKDIR /app

# The server bundle externalizes only its runtime deps; install just those.
RUN npm install --no-save --loglevel=error better-sqlite3@^12 hono@^4 @hono/node-server@^1

COPY dist/ ./dist/
COPY dist-ui/ ./dist-ui/

ENV HOOKKIT_INSPECTOR_HOST=0.0.0.0
ENV HOOKKIT_INSPECTOR_PORT=4000
ENV HOOKKIT_INSPECTOR_DB=/data/inspector.sqlite
VOLUME /data
EXPOSE 4000

CMD ["node", "dist/standalone.js"]
