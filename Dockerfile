# ==================================
FROM node:22-alpine AS base
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

# Start application
CMD sh -c "node qbt-filter.js"
