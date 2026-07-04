# @hookkit-dev/relay — OPTIONAL, USER-self-hosted. HookKit never operates one.
# Build from the package dir AFTER `pnpm build`:
#   pnpm --filter @hookkit-dev/relay build
#   docker build -t hookkit-relay packages/relay
#
# Run (tokens are shared secrets — pick long random values):
#   docker run -p 8787:8787 -e RELAY_TOKENS=$(openssl rand -hex 24) hookkit-relay
FROM node:20-alpine

WORKDIR /app
RUN npm install --no-save --loglevel=error ws@^8
COPY dist/ ./dist/

ENV RELAY_PORT=8787
EXPOSE 8787

CMD ["node", "dist/server-cli.js"]
