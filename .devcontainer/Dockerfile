# Dev/agent container for travel-plan. Environment only — the app is bind-mounted
# at runtime (see ../dc.sh), so this image does NOT COPY the project and rebuilds
# stay fast. For PRODUCTION see the root ./Dockerfile (Dokku).
FROM node:22-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates python3 make g++ sudo \
 && rm -rf /var/lib/apt/lists/* \
 && echo 'node ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/node \
 && chmod 0440 /etc/sudoers.d/node

# Claude Code CLI for the autonomous agent / interactive sessions.
RUN npm install -g @anthropic-ai/claude-code

# The project's .npmrc points npm's cache at a host-absolute macOS path that does
# not exist here; override it with a container-local cache (env beats .npmrc).
ENV npm_config_cache=/home/node/.npm

USER node
WORKDIR /work
