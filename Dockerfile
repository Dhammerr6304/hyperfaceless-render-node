FROM node:20-bookworm-slim

# Hyperframes drives headless Chromium + FFmpeg.
# Install both system-wide so npx hyperframes can find them.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ffmpeg \
    fonts-liberation \
    fonts-noto-core \
    fonts-noto-color-emoji \
    ca-certificates \
    dumb-init \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    HYPERFRAMES_CHROME_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    HYPERFRAMES_WORK_DIR=/data/renders

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Pre-warm hyperframes so first render isn't slow.
RUN npx --yes hyperframes --version || true

RUN mkdir -p /data/renders && chown -R node:node /data /app
USER node

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
