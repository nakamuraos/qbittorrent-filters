/**
 * @since 2025/01/27
 * @author ThinhHV <thinh@thinhhv.com>
 * @description Shared types and interfaces for qBittorrent filter modules
 * @copyright (c) 2025 ThinhHV Platform
 */

/**
 * Peer information from qBittorrent API
 */
export interface PeerInfo {
  ip: string;
  port: number;
  client: string;
  peer_id_client: string;
  progress: number; // 0-1 (0% to 100%)
  downloaded: number; // bytes
  uploaded: number; // bytes
  dl_speed: number; // bytes per second
  up_speed: number; // bytes per second
  connection: string; // e.g., "BT", "μTP"
  country_code: string;
  country: string;
  flags: string;
  relevance: number;
}

/**
 * Torrent information from qBittorrent API
 */
export interface TorrentInfo {
  hash: string;
  name: string;
  size: number;
  progress: number;
  num_seeds: number;
  num_leechs: number;
  state: string;
}

/**
 * Peer metrics for tracking behavior
 */
export interface PeerMetrics {
  ip: string;
  torrentHash: string;
  client: string;

  // Timing
  firstSeen: Date;
  lastSeen: Date;
  connectionDuration: number; // seconds
  connectionCount: number;
  disconnectionCount: number;

  // Transfer stats
  totalDownloaded: number;
  totalUploaded: number;
  downloadSpeed: number;
  uploadSpeed: number;
  uploadRatio: number; // uploaded / downloaded

  // Progress tracking
  currentProgress: number;
  progressHistory: ProgressSnapshot[];

  // Request tracking
  pieceRequests: number;
  pieceCompleted: number;
  pieceAbandonRate: number;

  // Behavior scoring
  behaviorScore: number; // 0-100
  suspicionScore: number; // 0-100
  violations: Violation[];

  // Flags
  isWhitelisted: boolean;
  isFlagged: boolean;
  lastAnalysis?: Date;
}

/**
 * Progress snapshot at a point in time
 */
export interface ProgressSnapshot {
  timestamp: Date;
  progress: number;
  downloaded: number;
  uploaded: number;
  downloadSpeed: number;
  uploadSpeed: number;
}

/**
 * Violation record
 */
export interface Violation {
  type: ViolationType;
  timestamp: Date;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  details: Record<string, any>;
  scoreImpact: number;
}

/**
 * Types of violations
 */
export enum ViolationType {
  ZERO_UPLOAD = "zero_upload",
  HIT_AND_RUN = "hit_and_run",
  PROGRESS_MISMATCH = "progress_mismatch",
  STALLED_PROGRESS = "stalled_progress",
  IMPOSSIBLE_SPEED = "impossible_speed",
  COMPLETE_BUT_DOWNLOADING = "complete_but_downloading",
  ZERO_PROGRESS_LEECHER = "zero_progress_leecher",
  PIECE_REQUEST_FLOODING = "piece_request_flooding",
  RAPID_DISCONNECT = "rapid_disconnect",
  SUSPICIOUS_RATIO = "suspicious_ratio",
  ABNORMAL_BEHAVIOR = "abnormal_behavior",
}

/**
 * Detection result
 */
export interface DetectionResult {
  shouldBan: boolean;
  shouldWarn: boolean;
  shouldWhitelist: boolean;
  reason: string;
  violations: Violation[];
  behaviorScore: number;
  suspicionScore: number;
  details: Record<string, any>;
  recommendations: string[];
}

/**
 * Smart detection configuration
 */
export interface SmartDetectionConfig {
  // Enable/disable features
  enabled: boolean;
  enableProgressTracking: boolean;
  enableBehaviorScoring: boolean;
  enableRateDetection: boolean;
  enableAutoWhitelist: boolean;

  // Thresholds
  minTrackingSeconds: number;
  checkIntervalSeconds: number;
  maxHistoryPoints: number;

  // Upload/Download monitoring
  minUploadRatio: number;
  minUploadAfterMB: number;
  gracePeriodMinutes: number;

  // Connection behavior
  minConnectionMinutes: number;
  maxDisconnectPerHour: number;
  rapidDisconnectThresholdSec: number;

  // Progress validation
  maxProgressMismatchPercent: number;
  stalledProgressMinutes: number;
  impossibleSpeedMultiplier: number;

  // Performance thresholds
  minAverageSpeedKBps: number;
  maxAverageSpeedKBps: number;
  pieceRequestTimeoutSec: number;

  // Scoring thresholds
  banScoreThreshold: number;
  warnScoreThreshold: number;
  whitelistScoreThreshold: number;
  scoreDecayHours: number;

  // Advanced features
  enableCrossSwarmTracking: boolean;
  enablePredictiveBanning: boolean;
  communityReputationSync: boolean;

  // Cleanup
  cleanupIntervalMinutes: number;
  maxPeerAgeMinutes: number;
}

/**
 * Statistics for monitoring
 */
export interface SmartDetectionStats {
  totalPeersTracked: number;
  activePeers: number;
  whitelistedPeers: number;
  flaggedPeers: number;
  bannedPeers: number;

  violationCounts: Record<ViolationType, number>;

  averageBehaviorScore: number;
  averageSuspicionScore: number;
  averageUploadRatio: number;

  detectionRate: number; // violations per hour
  falsePositiveRate: number;

  performanceMetrics: {
    analysisTimeMs: number;
    memoryUsageMB: number;
    lastCleanup: Date;
  };
}

/**
 * Ban action details
 */
export interface BanAction {
  ip: string;
  peerId: string;
  reason: string;
  violations: Violation[];
  score: number;
  timestamp: Date;
  torrentHash: string;
  torrentName: string;
  client: string;
  country: string;
}
