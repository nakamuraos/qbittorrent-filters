# Smart Rate-Based Detection

Advanced peer detection system for qBittorrent that goes beyond simple client name blocking.

## Overview

The Smart Rate-Based Detection system analyzes peer behavior patterns to identify and ban malicious or problematic peers automatically. It tracks metrics like upload/download ratios, progress consistency, connection patterns, and more.

## Features

### 1. **Progress Tracking**
- Detects progress vs. data mismatch (peer claims 50% but downloaded 90%)
- Identifies stalled progress (stuck at same percentage while downloading)
- Catches impossible speed (progress increases faster than network allows)
- Flags peers at 100% that are still downloading
- Tracks zero-progress long-term leechers

### 2. **Rate-Based Detection**
- Monitors upload/download ratios
- Detects zero-upload leechers after grace period
- Identifies hit-and-run behavior (quick disconnect after download)
- Flags suspicious upload patterns based on progress
- Detects rapid disconnect/reconnect patterns

### 3. **Behavioral Scoring**
- Calculates behavior score (0-100) for each peer
- Positive behaviors increase score (good upload ratio, stable connection)
- Negative behaviors decrease score (zero upload, frequent disconnects)
- Automatic whitelisting for consistently good peers
- Score decay over time returns peers to neutral

### 4. **Automated Actions**
- Auto-ban peers exceeding suspicion threshold
- Warn about suspicious peers in debug mode
- Auto-whitelist well-behaved peers
- Periodic cleanup of old tracking data

## Usage

### Basic Usage

Enable smart detection with default settings:

```bash
yarn start --enable-smart-detection
```

### With Custom Configuration

```bash
yarn start \
  --enable-smart-detection \
  --smart-ban-score 70 \
  --smart-warn-score 40 \
  --min-upload-ratio 0.15 \
  --grace-period-minutes 15 \
  --enable-auto-whitelist
```

### Environment Variables

```bash
# Enable smart detection
ENABLE_SMART_DETECTION=true

# Scoring thresholds
SMART_BAN_SCORE=75           # Ban if suspicion score exceeds this
SMART_WARN_SCORE=50          # Warn if suspicion score exceeds this

# Upload requirements
MIN_UPLOAD_RATIO=0.1         # Minimum upload ratio (10%)
GRACE_PERIOD_MINUTES=10      # Grace period before enforcing upload

# Features
ENABLE_AUTO_WHITELIST=true   # Auto-whitelist good peers
EXPORT_SMART_DATA=./data.json  # Export data on exit

# Use with qBittorrent settings
URL=127.0.0.1
PORT=8080
USERNAME=admin
PASSWORD=adminpass
TIME_INTERVAL=10
```

## CLI Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--enable-smart-detection` | `-sd` | Enable smart detection system | `false` |
| `--smart-ban-score` | | Suspicion score threshold for auto-ban | `75` |
| `--smart-warn-score` | | Suspicion score threshold for warnings | `50` |
| `--min-upload-ratio` | | Minimum upload ratio required | `0.1` |
| `--grace-period-minutes` | | Grace period before enforcing upload | `10` |
| `--enable-auto-whitelist` | | Auto-whitelist well-behaved peers | `false` |
| `--export-smart-data` | | Export detection data to file on exit | `false` |

## How It Works

### Detection Flow

```
1. Peer connects to torrent
   ↓
2. System tracks metrics (download, upload, progress, speed)
   ↓
3. After minimum tracking time (60s), analysis begins
   ↓
4. Multiple detectors analyze the peer:
   - Progress Detector: Checks progress consistency
   - Rate Detector: Monitors upload/download patterns
   - Behavior Scorer: Calculates overall behavior score
   ↓
5. Violations are recorded with severity levels
   ↓
6. Decision made based on total suspicion score:
   - Score ≥ 75: Auto-ban
   - Score 50-74: Warning (if debug enabled)
   - Score < 50: Continue monitoring
   ↓
7. Good peers (score > 80, no violations) may be auto-whitelisted
```

### Scoring System

**Behavior Score (0-100)**
- Starts at 50 (neutral)
- Upload contribution: +25 max
- Connection stability: +15 max
- Progress consistency: +10 max
- Transfer efficiency: +10 max

**Suspicion Score (0-100+)**
- Starts at 0
- Each violation adds points based on severity:
  - Low: +10
  - Medium: +20
  - High: +30
  - Critical: +40

**Example Scenarios:**

```
Good Peer:
- Upload ratio: 1.5 → +25 behavior
- Stable connection: 30 min → +15 behavior
- Consistent progress → +10 behavior
- Final: 85/100 behavior, 0 suspicion
→ Action: Auto-whitelist

Bad Peer:
- Zero upload after 15 min → +30 suspicion
- Progress mismatch 25% → +20 suspicion
- Stalled progress → +25 suspicion
- Final: 30/100 behavior, 75 suspicion
→ Action: Auto-ban

Suspicious Peer:
- Low upload ratio (0.2) → -5 behavior
- Some progress issues → +15 suspicion
- Final: 45/100 behavior, 15 suspicion
→ Action: Monitor closely
```

## Violation Types

### Progress-Based

1. **Progress Mismatch**
   - Reported progress doesn't match actual data downloaded
   - Example: Claims 50% complete but downloaded 90% of torrent size

2. **Stalled Progress**
   - Progress stuck while actively downloading
   - Example: No progress change in 10+ minutes with download speed >1KB/s

3. **Impossible Speed**
   - Progress increases faster than download speed allows
   - Example: Progress jumped 10% in 30 seconds but speed was only 100KB/s

4. **Complete But Downloading**
   - Peer claims 100% but still downloading
   - Critical violation, often indicates spoofed client

5. **Zero Progress Leecher**
   - Downloaded significant data but progress remains near 0%
   - Example: Downloaded 100MB but still at 2% progress

### Rate-Based

1. **Zero Upload**
   - No upload contribution after grace period
   - Example: Downloaded 200MB with 0 bytes uploaded after 15 minutes

2. **Hit and Run**
   - Quick disconnect after downloading
   - Example: Downloaded 100MB in 3 minutes with 0.05 ratio

3. **Suspicious Ratio**
   - Low upload at high progress
   - Example: At 80% progress but upload ratio is only 0.02

4. **Rapid Disconnect**
   - Frequent disconnect/reconnect pattern
   - Example: 5 disconnects in 3 connections

## Output Examples

### Normal Operation

```bash
[2025-01-27T10:30:15.841Z] Start filter with options
[2025-01-27T10:30:15.850Z] Smart detection enabled with config: { enabled: true, banScoreThreshold: 75, ... }
[2025-01-27T10:30:16.925Z] Monitoring 3 active torrents.
[2025-01-27T10:30:17.100Z] Smart Detection Stats: { tracked: 45, active: 32, whitelisted: 5, flagged: 8, toBan: 2 }
```

### Warning Example

```bash
[2025-01-27T10:30:45.200Z] WARNING: 59.52.206.49 XunLei 0.0.1.8 Score: 55/35 Elevated suspicion (score: 55)
```

### Ban Example (Client-Based)

```bash
[2025-01-27T10:31:14.081Z] Banned 59.52.206.49:3134 μTP Xunlei 0.0.1.8 -XL0018- 🇨🇳  China
[2025-01-27T10:31:14.100Z] Banned 1 peers (client-based)
```

### Ban Example (Smart Detection)

```bash
[2025-01-27T10:32:30.500Z] BANNED (Smart): 220.166.141.70:26248 BitComet Behavior: 25 Suspicion: 85
[2025-01-27T10:32:30.501Z]    └─ [high] Zero upload after 15.0 minutes and 250.5MB downloaded
[2025-01-27T10:32:30.502Z]    └─ [critical] Peer claims 100% complete but still downloading at 5.2 MB/s
[2025-01-27T10:32:30.503Z]    └─ [medium] Progress mismatch: 18.5% difference between reported progress and actual data
[2025-01-27T10:32:30.550Z] Banned 1 peers (smart detection)
```

### Auto-Whitelist Example

```bash
[2025-01-27T10:35:00.123Z] AUTO-WHITELISTED: 192.168.1.100 qBittorrent 4.5.0 Excellent long-term behavior: 26.5h, ratio 2.35
```

### Export on Exit

```bash
^C
Shutting down...
Smart detection data exported to: /Users/you/qbt-filter/smart-detection-data.json
Stats: 127 tracked, 15 banned, 8 whitelisted
Exited.
```

## Configuration Tuning

### Strict Configuration (Private Trackers)

```bash
yarn start \
  --enable-smart-detection \
  --smart-ban-score 60 \
  --min-upload-ratio 0.3 \
  --grace-period-minutes 5 \
  --enable-auto-whitelist
```

### Relaxed Configuration (Public Torrents)

```bash
yarn start \
  --enable-smart-detection \
  --smart-ban-score 85 \
  --min-upload-ratio 0.05 \
  --grace-period-minutes 20
```

### Testing Configuration

```bash
yarn start \
  --enable-smart-detection \
  --smart-warn-score 30 \
  --debug \
  --dry
```

## Docker Compose Example

```yaml
services:
  qbittorrent-filters:
    container_name: qbittorrent-filters
    image: thinhhv/qbittorrent-filters:latest
    restart: always
    network_mode: host
    environment:
      # Basic settings
      URL: "127.0.0.1"
      PORT: "8080"
      TIME_INTERVAL: "10"

      # Smart detection
      ENABLE_SMART_DETECTION: "true"
      SMART_BAN_SCORE: "75"
      SMART_WARN_SCORE: "50"
      MIN_UPLOAD_RATIO: "0.1"
      GRACE_PERIOD_MINUTES: "10"
      ENABLE_AUTO_WHITELIST: "true"
      EXPORT_SMART_DATA: "/data/smart-detection.json"

      # Debug
      DEBUG: "true"
    volumes:
      - ./data:/data
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
```

## Exported Data Format

When using `--export-smart-data`, the system exports a JSON file with:

```json
{
  "exportedAt": "2025-01-27T10:45:00.000Z",
  "stats": {
    "totalPeersTracked": 127,
    "activePeers": 45,
    "whitelistedPeers": 8,
    "flaggedPeers": 23,
    "bannedPeers": 15,
    "violationCounts": {
      "zero_upload": 8,
      "progress_mismatch": 5,
      "complete_but_downloading": 2
    },
    "averageBehaviorScore": 52,
    "averageSuspicionScore": 18,
    "averageUploadRatio": 0.45
  },
  "peers": [
    {
      "ip": "192.168.1.100",
      "client": "qBittorrent 4.5.0",
      "progress": "95.50%",
      "downloaded": "1250.50 MB",
      "uploaded": "2100.25 MB",
      "uploadRatio": "1.68",
      "behaviorScore": 85,
      "suspicionScore": 0,
      "violations": 0,
      "isWhitelisted": true,
      "connectionDuration": "125.5 min"
    }
  ]
}
```

## Module Architecture

The smart detection system is split into modular components:

```
src/
├── types.ts                      # Shared TypeScript interfaces
├── modules/
│   ├── peer-metrics.ts          # Tracks peer metrics over time
│   ├── behavior-scorer.ts       # Calculates behavior scores
│   ├── progress-detector.ts     # Detects progress-based violations
│   ├── rate-detector.ts         # Detects rate-based violations
│   └── smart-detector.ts        # Main coordinator
└── index.ts                      # Integrates with Filter class
```

## Performance Considerations

- **Memory Usage**: ~2-5MB per 100 tracked peers
- **CPU Impact**: Minimal, analysis runs only during filter intervals
- **Network**: No additional network requests beyond existing qBittorrent API calls
- **Storage**: Optional data export is ~1-10KB per peer

## Troubleshooting

### Smart detection not working

```bash
# Check if enabled
yarn start --enable-smart-detection --debug

# Look for this line in output:
# "Smart detection enabled with config: ..."
```

### Too many false positives

```bash
# Increase thresholds
yarn start \
  --enable-smart-detection \
  --smart-ban-score 90 \
  --grace-period-minutes 20
```

### Not catching bad peers

```bash
# Decrease thresholds
yarn start \
  --enable-smart-detection \
  --smart-ban-score 60 \
  --min-upload-ratio 0.2
```

### See detailed analysis

```bash
# Enable debug mode
yarn start --enable-smart-detection --debug
```
