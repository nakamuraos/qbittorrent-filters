/**
 * @since 2025/01/27
 * @author ThinhHV <thinh@thinhhv.com>
 * @description Behavioral scoring system for peers
 * @copyright (c) 2025 ThinhHV Platform
 */

import type { PeerMetrics, SmartDetectionConfig } from "../types.ts";

/**
 * Scores peer behavior and calculates suspicion levels
 */
export class BehaviorScorer {
  private config: SmartDetectionConfig;

  constructor(config: SmartDetectionConfig) {
    this.config = config;
  }

  /**
   * Calculate comprehensive behavior score (0-100)
   * Higher score = better behavior
   */
  calculateBehaviorScore(metrics: PeerMetrics): {
    score: number;
    breakdown: Record<string, number>;
    reasons: string[];
  } {
    let score = 50; // Start neutral
    const breakdown: Record<string, number> = {};
    const reasons: string[] = [];

    // 1. Upload Contribution (+25 max)
    const uploadScore = this.scoreUploadBehavior(metrics);
    score += uploadScore.points;
    breakdown.upload = uploadScore.points;
    if (uploadScore.reason) reasons.push(uploadScore.reason);

    // 2. Connection Stability (+15 max)
    const stabilityScore = this.scoreConnectionStability(metrics);
    score += stabilityScore.points;
    breakdown.stability = stabilityScore.points;
    if (stabilityScore.reason) reasons.push(stabilityScore.reason);

    // 3. Progress Consistency (+10 max)
    const progressScore = this.scoreProgressConsistency(metrics);
    score += progressScore.points;
    breakdown.progress = progressScore.points;
    if (progressScore.reason) reasons.push(progressScore.reason);

    // 4. Data Transfer Efficiency (+10 max)
    const efficiencyScore = this.scoreTransferEfficiency(metrics);
    score += efficiencyScore.points;
    breakdown.efficiency = efficiencyScore.points;
    if (efficiencyScore.reason) reasons.push(efficiencyScore.reason);

    // Normalize to 0-100
    score = Math.max(0, Math.min(100, score));

    return { score, breakdown, reasons };
  }

  /**
   * Score upload contribution
   */
  private scoreUploadBehavior(metrics: PeerMetrics): {
    points: number;
    reason: string;
  } {
    const uploadRatio = metrics.uploadRatio;
    const totalDownloadedMB = metrics.totalDownloaded / 1024 / 1024;

    // Excellent ratio (>1.5)
    if (uploadRatio > 1.5) {
      return {
        points: 25,
        reason: `Excellent upload ratio: ${uploadRatio.toFixed(2)}`,
      };
    }

    // Good ratio (>1.0)
    if (uploadRatio > 1.0) {
      return {
        points: 20,
        reason: `Good upload ratio: ${uploadRatio.toFixed(2)}`,
      };
    }

    // Fair ratio (>0.5)
    if (uploadRatio > 0.5) {
      return {
        points: 10,
        reason: `Fair upload ratio: ${uploadRatio.toFixed(2)}`,
      };
    }

    // Low ratio but early in download
    if (totalDownloadedMB < this.config.minUploadAfterMB) {
      return {
        points: 5,
        reason: "Still in grace period for uploads",
      };
    }

    // Poor ratio
    if (uploadRatio > 0.1) {
      return {
        points: -5,
        reason: `Low upload ratio: ${uploadRatio.toFixed(2)}`,
      };
    }

    // Zero upload
    return {
      points: -15,
      reason: "No upload contribution",
    };
  }

  /**
   * Score connection stability
   */
  private scoreConnectionStability(metrics: PeerMetrics): {
    points: number;
    reason: string;
  } {
    const durationMinutes = metrics.connectionDuration / 60;
    const reconnectRate =
      metrics.disconnectionCount / Math.max(metrics.connectionCount, 1);

    // Long stable connection
    if (durationMinutes > 30 && reconnectRate < 0.1) {
      return {
        points: 15,
        reason: `Stable connection: ${durationMinutes.toFixed(0)} minutes`,
      };
    }

    // Moderate connection
    if (durationMinutes > 15 && reconnectRate < 0.3) {
      return {
        points: 10,
        reason: `Moderate stability: ${durationMinutes.toFixed(0)} minutes`,
      };
    }

    // Short but stable
    if (durationMinutes > 5 && reconnectRate < 0.2) {
      return { points: 5, reason: "Short but stable connection" };
    }

    // High reconnect rate
    if (reconnectRate > 0.5) {
      return {
        points: -10,
        reason: `High reconnect rate: ${reconnectRate.toFixed(2)}`,
      };
    }

    // Very short connection
    if (durationMinutes < 2) {
      return { points: -5, reason: "Very short connection time" };
    }

    return { points: 0, reason: "Neutral connection stability" };
  }

  /**
   * Score progress consistency
   */
  private scoreProgressConsistency(metrics: PeerMetrics): {
    points: number;
    reason: string;
  } {
    if (metrics.progressHistory.length < 2) {
      return { points: 0, reason: "Insufficient progress data" };
    }

    const firstProgress = metrics.progressHistory[0].progress;
    const lastProgress =
      metrics.progressHistory[metrics.progressHistory.length - 1].progress;
    const progressIncrease = lastProgress - firstProgress;
    const timeSpan =
      (metrics.progressHistory[
        metrics.progressHistory.length - 1
      ].timestamp.getTime() -
        metrics.progressHistory[0].timestamp.getTime()) /
      1000 /
      60;

    // Good progress over time
    if (progressIncrease > 0.1 && timeSpan > 5) {
      return {
        points: 10,
        reason: `Good progress: +${(progressIncrease * 100).toFixed(1)}% in ${timeSpan.toFixed(0)}min`,
      };
    }

    // Steady progress
    if (progressIncrease > 0.05 && timeSpan > 2) {
      return { points: 5, reason: "Steady progress" };
    }

    // Completed or near completion
    if (lastProgress > 0.95) {
      return { points: 8, reason: "Near or at completion" };
    }

    // Stalled with active download
    if (
      progressIncrease < 0.01 &&
      timeSpan > 10 &&
      metrics.downloadSpeed > 1000
    ) {
      return { points: -8, reason: "Stalled progress despite downloading" };
    }

    return { points: 0, reason: "Normal progress pattern" };
  }

  /**
   * Score transfer efficiency
   */
  private scoreTransferEfficiency(metrics: PeerMetrics): {
    points: number;
    reason: string;
  } {
    const abandonRate = metrics.pieceAbandonRate;

    // Very efficient
    if (abandonRate < 0.05) {
      return { points: 10, reason: "Excellent transfer efficiency" };
    }

    // Good efficiency
    if (abandonRate < 0.15) {
      return { points: 5, reason: "Good transfer efficiency" };
    }

    // Moderate efficiency
    if (abandonRate < 0.3) {
      return { points: 0, reason: "Moderate efficiency" };
    }

    // Poor efficiency
    if (abandonRate < 0.5) {
      return {
        points: -5,
        reason: `High abandon rate: ${(abandonRate * 100).toFixed(0)}%`,
      };
    }

    // Very poor
    return {
      points: -10,
      reason: `Very high abandon rate: ${(abandonRate * 100).toFixed(0)}%`,
    };
  }

  /**
   * Apply score decay over time
   * Scores gradually return to neutral (50) over time
   */
  applyScoreDecay(
    currentScore: number,
    lastAnalysis: Date | undefined,
  ): number {
    if (!lastAnalysis) return currentScore;

    const hoursSinceAnalysis =
      (new Date().getTime() - lastAnalysis.getTime()) / 1000 / 60 / 60;

    if (hoursSinceAnalysis < 1) return currentScore;

    const decayPerHour = (currentScore - 50) / this.config.scoreDecayHours;
    const decayAmount =
      decayPerHour * Math.min(hoursSinceAnalysis, this.config.scoreDecayHours);

    return Math.round(currentScore - decayAmount);
  }

  /**
   * Check if peer qualifies for auto-whitelist
   */
  shouldWhitelist(metrics: PeerMetrics): {
    shouldWhitelist: boolean;
    reason: string;
  } {
    if (!this.config.enableAutoWhitelist) {
      return { shouldWhitelist: false, reason: "Auto-whitelist disabled" };
    }

    if (metrics.isWhitelisted) {
      return { shouldWhitelist: false, reason: "Already whitelisted" };
    }

    const durationHours = metrics.connectionDuration / 60 / 60;
    const uploadRatio = metrics.uploadRatio;

    // Criteria for whitelisting:
    // 1. Connected for >24 hours OR multiple sessions with good behavior
    // 2. Upload ratio >1.5
    // 3. No violations
    // 4. Behavior score >80

    const longSession = durationHours > 24;
    const goodRatio = uploadRatio > 1.5;
    const noViolations = metrics.violations.length === 0;
    const highScore =
      metrics.behaviorScore > this.config.whitelistScoreThreshold;

    if (longSession && goodRatio && noViolations && highScore) {
      return {
        shouldWhitelist: true,
        reason: `Excellent long-term behavior: ${durationHours.toFixed(1)}h, ratio ${uploadRatio.toFixed(2)}`,
      };
    }

    // Alternative: Multiple connections with consistently good behavior
    if (
      metrics.connectionCount >= 10 &&
      goodRatio &&
      noViolations &&
      highScore
    ) {
      return {
        shouldWhitelist: true,
        reason: `Consistent good behavior across ${metrics.connectionCount} sessions`,
      };
    }

    return {
      shouldWhitelist: false,
      reason: "Does not meet whitelist criteria",
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SmartDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
