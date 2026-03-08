# NanoClaw Agent Container
# Runs opencode in isolated Linux VM

FROM node:22-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install opencode globally
RUN npm install -g opencode-ai

# Create app directory
WORKDIR /app

# Copy package files first for better caching
COPY agent-runner/package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY agent-runner/ ./

# Copy SSH known hosts for GitHub
COPY .github_known_hosts /home/node/.ssh/known_hosts
RUN chmod 644 /home/node/.ssh/known_hosts

# Build TypeScript
RUN npm run build

# Create workspace directories
RUN mkdir -p /workspace/group /workspace/global /workspace/extra /workspace/ipc/messages /workspace/ipc/tasks /workspace/ipc/input

# Create .ssh directory and set up Git authentication
RUN mkdir -p /home/node/.ssh && chmod 700 /home/node/.ssh

# Create entrypoint script
# Secrets are passed via stdin JSON — temp file is deleted immediately after Node reads it
# Follow-up messages arrive via IPC files in /workspace/ipc/input/
# The TypeScript is pre-built during Docker build, skip recompilation at runtime
RUN printf '#!/bin/bash\nset -e\n# Fix permissions for mounted IPC directory (may be root-owned on host)\nchmod -R 777 /workspace/ipc 2>/dev/null || true\ncat > /tmp/input.json\nnode /app/dist/index.js < /tmp/input.json\n' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Set ownership to node user (non-root) for writable directories
RUN chown -R node:node /workspace && chmod 777 /home/node

# Set environment variable for opencode to allow access to /workspace/extra
ENV CLAUDE_CODE_DIRECTORIES=/workspace/extra

# Switch to non-root user (required for --dangerously-skip-permissions)
USER node

# Configure Git in the container
RUN git config --global user.email "nanoclaw@huwe-0306" && \
    git config --global user.name "NanoClaw"

# Set working directory to group workspace
WORKDIR /workspace/group

# Entry point reads JSON from stdin, outputs JSON to stdout
ENTRYPOINT ["/app/entrypoint.sh"]
