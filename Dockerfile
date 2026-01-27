# ==================================
FROM node:lts-alpine AS base
LABEL author="ThinhHV <thinh@thinhhv.com>"
LABEL repository="https://github.com/nakamuraos/qbittorrent-filters"

# Create workdir
WORKDIR /app

# ==============================
FROM base AS builder

# Install dependencies
COPY package.json yarn.lock ./
RUN yarn

# Bundle app source
COPY . .
RUN yarn build

# ==============================
FROM base

COPY --from=builder /app/dist/qbt-filter.js ./

# Set ownership and switch to non-root user
RUN chown node:node qbt-filter.js
USER node

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('healthy')" || exit 1

# Start application
CMD ["node", "qbt-filter.js"]
