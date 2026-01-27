/**
 * @since 2025/01/27
 * @author ThinhHV <thinh@thinhhv.com>
 * @description Main coordinator for smart peer detection system
 * @copyright (c) 2025 ThinhHV Platform
 */

import type {
  PeerInfo,
  TorrentInfo,
  DetectionResult,
  SmartDetectionConfig,
  SmartDetectionStats,
  Violation,
  ViolationType,
} from "../types.ts";
import { PeerMetricsTracker } from "./peer-metrics.ts";
import { BehaviorScorer } from "./behavior-scorer.ts";
import { ProgressDetector } from "./progress-detector.ts";
import { RateDetector } from "./rate-detector.ts";

/**
 * Default configuration for smart detection
 */
export const defaultSmartDetectionConfig: SmartDetectionConfig = {
  // Enable/disable features
  enabled: true,
  enableProgressTracking: true,
  enableBehaviorScoring: true,
  enableRateDetection: true,
  enableAutoWhitelist: true,

  // Thresholds
  minTrackingSeconds: 60,
  checkIntervalSeconds: 30,
  maxHistoryPoints: 100,

  // Upload/Download monitoring
  minUploadRatio: 0.1,
  minUploadAfterMB: 100,
  gracePeriodMinutes: 10,

  // Connection behavior
  minConnectionMinutes: 5,
  maxDisconnectPerHour: 5,
  rapidDisconnectThresholdSec: 60,

  // Progress validation
  maxProgressMismatchPercent: 15,
  stalledProgressMinutes: 10,
  impossibleSpeedMultiplier: 2.0,

  // Performance thresholds
  minAverageSpeedKBps: 0, // 0 = no minimum
  maxAverageSpeedKBps: 0, // 0 = no maximum
  pieceRequestTimeoutSec: 60,

  // Scoring thresholds
  banScoreThreshold: 75,
  warnScoreThreshold: 50,
  whitelistScoreThreshold: 80,
  scoreDecayHours: 24,

  // Advanced features
  enableCrossSwarmTracking: true,
  enablePredictiveBanning: false,
  communityReputationSync: false,

  // Cleanup
  cleanupIntervalMinutes: 30,
  maxPeerAgeMinutes: 60,
};

/**
 * Main smart detection coordinator
 */
export class SmartDetector {
  private config: SmartDetectionConfig;
  private metricsTracker: PeerMetricsTracker;
  private behaviorScorer: BehaviorScorer;
  private progressDetector: ProgressDetector;
  private rateDetector: RateDetector;
  private lastCleanup: Date = new Date();
  private analysisStartTime: number = 0;

  constructor(config: Partial<SmartDetectionConfig> = {}) {
    this.config = { ...defaultSmartDetectionConfig, ...config };
    this.metricsTracker = new PeerMetricsTracker(this.config.maxHistoryPoints);
    this.behaviorScorer = new BehaviorScorer(this.config);
    this.progressDetector = new ProgressDetector(this.config);
    this.rateDetector = new RateDetector(this.config);
  }

  /**
   * Analyze a peer and return detection results
   */
  analyzePeer(peer: PeerInfo, torrent: TorrentInfo): DetectionResult {
    if (!this.config.enabled) {
      return this.createNullResult();
    }

    this.analysisStartTime = Date.now();

    // Update metrics
    const metrics = this.metricsTracker.updatePeer(
      peer,
      torrent.hash,
      torrent.size,
    );

    // Check if whitelisted
    if (metrics.isWhitelisted) {
      return {
        shouldBan: false,
        shouldWarn: false,
        shouldWhitelist: true,
        reason: "Peer is whitelisted",
        violations: [],
        behaviorScore: metrics.behaviorScore,
        suspicionScore: 0,
        details: { whitelisted: true },
        recommendations: [],
      };
    }

    // Check if tracked long enough
    if (metrics.connectionDuration < this.config.minTrackingSeconds) {
      return this.createNullResult("Insufficient tracking time");
    }

    const violations: Violation[] = [];
    const recommendations: string[] = [];

    // 1. Run progress-based detection
    if (this.config.enableProgressTracking) {
      const progressViolations = this.progressDetector.detectViolations(
        metrics,
        torrent.size,
      );
      violations.push(...progressViolations);
    }

    // 2. Run rate-based detection
    if (this.config.enableRateDetection) {
      const rateViolations = this.rateDetector.detectViolations(metrics);
      violations.push(...rateViolations);
    }

    // 3. Calculate behavior score
    let behaviorScore = 50;
    let scoreBreakdown: Record<string, number> = {};
    let scoreReasons: string[] = [];

    if (this.config.enableBehaviorScoring) {
      const scoreResult = this.behaviorScorer.calculateBehaviorScore(metrics);
      behaviorScore = scoreResult.score;
      scoreBreakdown = scoreResult.breakdown;
      scoreReasons = scoreResult.reasons;
    }

    // Apply score decay
    behaviorScore = this.behaviorScorer.applyScoreDecay(
      behaviorScore,
      metrics.lastAnalysis,
    );

    // 4. Calculate suspicion score from violations
    const suspicionScore = violations.reduce(
      (sum, v) => sum + v.scoreImpact,
      0,
    );

    // 5. Update metrics with scores
    this.metricsTracker.updateScores(
      peer.ip,
      torrent.hash,
      behaviorScore,
      suspicionScore,
    );

    // 6. Add violations to metrics
    violations.forEach((v) =>
      this.metricsTracker.addViolation(peer.ip, torrent.hash, v),
    );

    // 7. Check for auto-whitelist
    const whitelistCheck = this.behaviorScorer.shouldWhitelist(metrics);
    if (whitelistCheck.shouldWhitelist) {
      this.metricsTracker.whitelistPeer(peer.ip, torrent.hash);
      recommendations.push(whitelistCheck.reason);
    }

    // 8. Make decision
    const shouldBan =
      suspicionScore >= this.config.banScoreThreshold ||
      violations.some((v) => v.severity === "critical");
    const shouldWarn =
      !shouldBan && suspicionScore >= this.config.warnScoreThreshold;
    const shouldWhitelist = whitelistCheck.shouldWhitelist;

    // 9. Generate recommendations
    if (shouldBan) {
      recommendations.push(
        `Ban recommended: Suspicion score ${suspicionScore} exceeds threshold ${this.config.banScoreThreshold}`,
      );
    } else if (shouldWarn) {
      recommendations.push(
        `Monitor closely: Suspicion score ${suspicionScore} is elevated`,
      );
    }

    if (behaviorScore < 30) {
      recommendations.push(`Poor behavior score: ${behaviorScore}/100`);
    } else if (behaviorScore > 80) {
      recommendations.push(`Excellent behavior score: ${behaviorScore}/100`);
    }

    // Build reason
    let reason = "";
    if (shouldBan) {
      reason = violations.map((v) => v.description).join("; ");
    } else if (shouldWhitelist) {
      reason = whitelistCheck.reason;
    } else if (shouldWarn) {
      reason = `Elevated suspicion (score: ${suspicionScore})`;
    } else {
      reason = "Normal behavior";
    }

    return {
      shouldBan,
      shouldWarn,
      shouldWhitelist,
      reason,
      violations,
      behaviorScore,
      suspicionScore,
      details: {
        scoreBreakdown,
        scoreReasons,
        connectionDuration: metrics.connectionDuration,
        uploadRatio: metrics.uploadRatio,
        progress: metrics.currentProgress,
      },
      recommendations,
    };
  }

  /**
   * Batch analyze multiple peers
   */
  analyzePeers(
    peers: Map<string, PeerInfo>,
    torrent: TorrentInfo,
  ): Map<string, DetectionResult> {
    const results = new Map<string, DetectionResult>();

    for (const [peerId, peer] of peers.entries()) {
      const result = this.analyzePeer(peer, torrent);
      results.set(peerId, result);
    }

    return results;
  }

  /**
   * Get peers that should be banned
   */
  getPeersToBan(): Array<{
    ip: string;
    torrentHash: string;
    reason: string;
    violations: Violation[];
    score: number;
  }> {
    const allPeers = this.metricsTracker.getAllPeers();
    return allPeers
      .filter((p) => p.suspicionScore >= this.config.banScoreThreshold)
      .map((p) => ({
        ip: p.ip,
        torrentHash: p.torrentHash,
        reason: p.violations.map((v) => v.description).join("; "),
        violations: p.violations,
        score: p.suspicionScore,
      }));
  }

  /**
   * Get peers that should be warned
   */
  getPeersToWarn(): Array<{
    ip: string;
    torrentHash: string;
    score: number;
    violations: Violation[];
  }> {
    const allPeers = this.metricsTracker.getAllPeers();
    return allPeers
      .filter(
        (p) =>
          p.suspicionScore >= this.config.warnScoreThreshold &&
          p.suspicionScore < this.config.banScoreThreshold,
      )
      .map((p) => ({
        ip: p.ip,
        torrentHash: p.torrentHash,
        score: p.suspicionScore,
        violations: p.violations,
      }));
  }

  /**
   * Perform periodic cleanup
   */
  cleanup(): {
    cleaned: number;
    nextCleanup: Date;
  } {
    const now = new Date();
    const minutesSinceLastCleanup =
      (now.getTime() - this.lastCleanup.getTime()) / 1000 / 60;

    if (minutesSinceLastCleanup < this.config.cleanupIntervalMinutes) {
      return {
        cleaned: 0,
        nextCleanup: new Date(
          this.lastCleanup.getTime() +
            this.config.cleanupIntervalMinutes * 60 * 1000,
        ),
      };
    }

    const cleaned = this.metricsTracker.cleanup(this.config.maxPeerAgeMinutes);
    this.lastCleanup = now;

    return {
      cleaned,
      nextCleanup: new Date(
        now.getTime() + this.config.cleanupIntervalMinutes * 60 * 1000,
      ),
    };
  }

  /**
   * Get statistics
   */
  getStats(): SmartDetectionStats {
    const metricsStats = this.metricsTracker.getStats();
    const allPeers = this.metricsTracker.getAllPeers();

    // Count violations by type
    const violationCounts: Record<ViolationType, number> = {} as any;
    for (const peer of allPeers) {
      for (const violation of peer.violations) {
        violationCounts[violation.type] =
          (violationCounts[violation.type] || 0) + 1;
      }
    }

    // Calculate detection rate (violations per hour)
    const totalViolations = Object.values(violationCounts).reduce(
      (sum, count) => sum + count,
      0,
    );
    const trackingTimeHours =
      allPeers.length > 0
        ? allPeers.reduce((sum, p) => sum + p.connectionDuration, 0) /
          3600 /
          allPeers.length
        : 0;
    const detectionRate =
      trackingTimeHours > 0 ? totalViolations / trackingTimeHours : 0;

    const analysisTime = this.analysisStartTime
      ? Date.now() - this.analysisStartTime
      : 0;
    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;

    return {
      totalPeersTracked: metricsStats.totalPeers,
      activePeers: metricsStats.activePeers,
      whitelistedPeers: metricsStats.whitelistedPeers,
      flaggedPeers: metricsStats.flaggedPeers,
      bannedPeers: allPeers.filter(
        (p) => p.suspicionScore >= this.config.banScoreThreshold,
      ).length,
      violationCounts,
      averageBehaviorScore: metricsStats.averageBehaviorScore,
      averageSuspicionScore: metricsStats.averageSuspicionScore,
      averageUploadRatio: metricsStats.averageUploadRatio,
      detectionRate: Math.round(detectionRate * 100) / 100,
      falsePositiveRate: 0, // Would need user feedback to calculate
      performanceMetrics: {
        analysisTimeMs: analysisTime,
        memoryUsageMB: Math.round(memoryUsage * 100) / 100,
        lastCleanup: this.lastCleanup,
      },
    };
  }

  /**
   * Export data for analysis
   */
  exportData(): string {
    const allPeers = this.metricsTracker.getAllPeers();
    const data = allPeers.map((peer) => ({
      ip: peer.ip,
      torrentHash: peer.torrentHash,
      client: peer.client,
      progress: (peer.currentProgress * 100).toFixed(2) + "%",
      downloaded: (peer.totalDownloaded / 1024 / 1024).toFixed(2) + " MB",
      uploaded: (peer.totalUploaded / 1024 / 1024).toFixed(2) + " MB",
      uploadRatio: peer.uploadRatio.toFixed(2),
      behaviorScore: peer.behaviorScore,
      suspicionScore: peer.suspicionScore,
      violations: peer.violations.length,
      violationTypes: peer.violations.map((v) => v.type),
      isWhitelisted: peer.isWhitelisted,
      isFlagged: peer.isFlagged,
      connectionDuration: (peer.connectionDuration / 60).toFixed(1) + " min",
    }));

    return JSON.stringify(data, null, 2);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SmartDetectionConfig>): void {
    this.config = { ...this.config, ...config };
    this.behaviorScorer.updateConfig(this.config);
    this.progressDetector.updateConfig(this.config);
    this.rateDetector.updateConfig(this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): SmartDetectionConfig {
    return { ...this.config };
  }

  /**
   * Reset all data
   */
  reset(): void {
    this.metricsTracker.clear();
    this.lastCleanup = new Date();
  }

  /**
   * Create null result
   */
  private createNullResult(
    reason: string = "Detection disabled",
  ): DetectionResult {
    return {
      shouldBan: false,
      shouldWarn: false,
      shouldWhitelist: false,
      reason,
      violations: [],
      behaviorScore: 50,
      suspicionScore: 0,
      details: {},
      recommendations: [],
    };
  }
}
