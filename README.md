# qBittorrent Filters

A powerful script for qBittorrent that blocks problematic peers using both client name filtering and advanced behavioral analysis.

## Features

- **Client-Based Filtering**: Blocks known bad clients (Xunlei, Thunder, XL0012, etc.) automatically
- **Smart Rate-Based Detection**: Advanced behavioral analysis to detect suspicious peers
  - Progress tracking and validation
  - Upload/download ratio monitoring
  - Connection pattern analysis
  - Automatic whitelisting of good peers
  - [See detailed documentation](SMART_DETECTION.md)

## Default Block List

  ```txt
  Thunder
  XL0012
  BitComet
  XunLei
  Xfplay
  danda
  anacrolix
  devel
  dt/torrent
  unknown
  ```

# How to use

- Command line

  OR

- Docker compose

## Command line

- Usage

```bash
yarn start -h

USAGE: node qbt-filter.js [OPTION1] [OPTION2]... arg1 arg2...
The following options are supported:
  -u, --url <ARG1>                      URL of qBittorrent without 'http://' or 'https://' ("127.0.0.1" by default)
  -p, --port <ARG1>                     Port of qBittorrent ("8080" by default)
  -U, --username <ARG1>                 User to auth qBittorrent.
  -P, --password <ARG1>                 Password to auth qBittorrent. Leave blank to disable auth.
  -s, --ssl                             Use https protocol ("http" by default)
  -t, --time-interval <ARG1>            Time interval in seconds between filter checks ("10" by default)
  -c, --time-clear <ARG1>               Time interval in hours to clear banned peer list, 0 = disable ("0" by default)
  -ci, --clear-immediately              Clear immediately banned peer list
  -w, --watch                           Watch all peers (output to sdtout)
  -x, --block-clients                   Blocks clients unconditionally regardless of leeching status
  -b, --block-list <ARG1>...<ARGN>      Blocks clients conditionally with wildcards ("Thunder,XL0012,BitComet,Xunlei,Xfplay,danda,anacrolix,devel,dt/torrent,unknown" by default)
  --delimiter <ARG1>                    Delimiter marks the beginning or end of a wildcard of list ("," by default)
  --dry                                 Dry run for test
  --debug                               Print detail error logs
```

- Example command line:

```bash
# Show help:
yarn start -h

# Default params (client-based filtering only):
yarn start

# Custom params:
yarn start -u 127.0.0.1 -p 8080 -t 10 -c 1
yarn start -u 127.0.0.1 -p 8080 -U admin -P admin --dry --debug

# With smart detection enabled:
yarn start --enable-smart-detection
yarn start --enable-smart-detection --smart-ban-score 75 --enable-auto-whitelist

# Full example with smart detection:
yarn start \
  -u 127.0.0.1 -p 8080 \
  --enable-smart-detection \
  --smart-ban-score 70 \
  --min-upload-ratio 0.15 \
  --enable-auto-whitelist \
  --debug
```

For detailed smart detection configuration, see [SMART_DETECTION.md](SMART_DETECTION.md).

- Example log:

```bash
[2025-01-08T19:43:03.841Z] Start filter with options
 {
  url: '127.0.0.1',
  port: '8080',
  username: false,
  password: false,
  ssl: false,
  'time-interval': '10',
  'time-clear': '1',
  'clear-immediately': false,
  watch: false,
  'block-clients': false,
  'block-list': [
    'Thunder',    'XL0012',
    'BitComet',   'XunLei',
    'Xfplay',     'danda',
    'anacrolix',  'devel',
    'dt/torrent', 'unknown'
  ],
  delimiter: ',',
  dry: false,
  debug: false,
  'enable-smart-detection': false,
  'smart-ban-score': '75',
  'smart-warn-score': '50',
  'min-upload-ratio': '0.1',
  'grace-period-minutes': '10',
  'enable-auto-whitelist': false,
  'export-smart-data': false
}
[2025-01-08T19:43:03.849Z] No auth required. Ignored get cookie.
[2025-01-08T19:43:03.850Z] Fetching banned IPs...
[2025-01-08T19:43:03.925Z] Total 7 IPs banned.
[2025-01-08T19:44:14.081Z] Banned 59.52.206.49:3134 μTP Xunlei 0.0.1.8 -XL0018- 🇨🇳  China
[2025-01-08T19:44:14.100Z] Total 8 IPs banned.
[2025-01-08T19:44:54.105Z] Banned 220.166.141.70:26248 BT XunLei 0019 -XL0019- 🇨🇳  China
[2025-01-08T19:44:54.115Z] Total 9 IPs banned.
```

## Docker compose

```bash
# Update environment in .env
cp -rp .env.example .env

# Create file docker-compose.yml
services:
  qbittorrent-filters:
    container_name: qbittorrent-filters
    image: thinhhv/qbittorrent-filters:latest
    restart: always
    pull_policy: always
    network_mode: host
    init: true
    # Using command or update in environment
    # (the params in command will override environment variables)
    # command: sh -c "node qbt-filter.js -u 127.0.0.1 -p 8080 -t 10 -c 1"
    logging:
      driver: "json-file"
      options:
        max-size: "10m"

# Then up it
docker-compose up -d
```

## Calling API without authentication

- If username and password is not configured, `qbt-filter.js` will call direct API without authentication.
- Without authentication, you must use one of the two setting options in the qBittorrent UI:

  - Bypass authentication for clients on localhost.
  - Bypass authentication for clients in whitelisted IP subnets.

# Development

## Get Started

- Install dependencies

```bash
yarn
```

- Modify `src/index.ts` as you want and run:

```bash
yarn dev
```

## Build the source

- The source code can run direct without build (using `node --experimental-strip-types src/index.ts` NodeJS v22). However, if you want bundle all your Node.js dependencies into a single file (commonjs), you can using build command:

```bash
# Install all dependencies include devDependencies
yarn
# Build
yarn build
# Output file at locate: dist/qbt-filter.js
node dist/qbt-filter.js
```

# Author

- ThinhHV <https://github.com/nakamuraos>
