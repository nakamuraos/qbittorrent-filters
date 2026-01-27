/**
 * @since 2025/01/27
 * @author ThinhHV <thinh@thinhhv.com>
 * @description Progress-based anomaly detection
 * @copyright (c) 2025 ThinhHV Platform
 */

import type {
  PeerMetrics,
  Violation,
  ViolationType,
  SmartDetectionConfig,
} from "../types.ts";

/**
 * Detects progress-based anomalies and violations
 */
export class ProgressDetector {
  private config: SmartDetectionConfig;

  constructor(config: SmartDetectionConfig) {
    this.config = config;
  }

  /**
   * Detect all progress-based violations
   */
  detectViolations(metrics: PeerMetrics, torrentSize: number): Violation[] {
    if (!this.config.enableProgressTracking) {
      return [];
    }

    const violations: Violation[] = [];

    // 1. Progress vs Downloaded Data Mismatch
    const mismatchViolation = this.detectProgressMismatch(metrics, torrentSize);
    if (mismatchViolation) violations.push(mismatchViolation);

    // 2. Stalled Progress
    const stalledViolation = this.detectStalledProgress(metrics);
    if (stalledViolation) violations.push(stalledViolation);

    // 3. Impossible Speed
    const speedViolation = this.detectImpossibleSpeed(metrics, torrentSize);
    if (speedViolation) violations.push(speedViolation);

    // 4. Complete But Still Downloading
    const completeViolation = this.detectCompleteAnomaly(metrics);
    if (completeViolation) violations.push(completeViolation);

    // 5. Zero Progress Long-term Leecher
    const zeroProgressViolation = this.detectZeroProgressLeecher(metrics);
    if (zeroProgressViolation) violations.push(zeroProgressViolation);

    return violations;
  }

  /**
   * Detect progress vs data mismatch
   */
  private detectProgressMismatch(
    metrics: PeerMetrics,
    torrentSize: number,
  ): Violation | null {
    const expectedDownloaded = torrentSize * metrics.currentProgress;
    const actualDownloaded = metrics.totalDownloaded;
    const mismatchBytes = Math.abs(expectedDownloaded - actualDownloaded);
    const mismatchPercent = (mismatchBytes / torrentSize) * 100;

    if (mismatchPercent > this.config.maxProgressMismatchPercent) {
      const severity = this.getSeverity(mismatchPercent, [15, 30, 50]);
      const scoreImpact = this.getScoreImpact(severity);

      return {
        type: "progress_mismatch" as ViolationType,
        timestamp: new Date(),
        severity,
        description: `Progress mismatch: ${mismatchPercent.toFixed(1)}% difference between reported progress and actual data`,
        details: {
          expectedDownloaded: this.formatBytes(expectedDownloaded),
          actualDownloaded: this.formatBytes(actualDownloaded),
          mismatchPercent: mismatchPercent.toFixed(2),
          reportedProgress: (metrics.currentProgress * 100).toFixed(2) + "%",
        },
        scoreImpact,
      };
    }

    return null;
  }

  /**
   * Detect stalled progress
   */
  private detectStalledProgress(metrics: PeerMetrics): Violation | null {
    if (metrics.progressHistory.length < 3) return null;

    const recentHistory = metrics.progressHistory.slice(-5);
    const progressChanges = recentHistory.map((h, i) =>
      i === 0 ? 0 : h.progress - recentHistory[i - 1].progress,
    );
    const totalProgressChange = progressChanges.reduce((a, b) => a + b, 0);
    const stalledMinutes =
      (recentHistory[recentHistory.length - 1].timestamp.getTime() -
        recentHistory[0].timestamp.getTime()) /
      1000 /
      60;

    // Check if progress is stalled while actively downloading
    const isDownloading = metrics.downloadSpeed > 1000; // >1KB/s
    const progressStalled = totalProgressChange < 0.01; // <1% change
    const exceededTime = stalledMinutes > this.config.stalledProgressMinutes;
    const notComplete = metrics.currentProgress < 0.99;

    if (isDownloading && progressStalled && exceededTime && notComplete) {
      const severity = this.getSeverity(stalledMinutes, [10, 20, 30]);
      const scoreImpact = this.getScoreImpact(severity);

      return {
        type: "stalled_progress" as ViolationType,
        timestamp: new Date(),
        severity,
        description: `Stalled progress: No progress change in ${stalledMinutes.toFixed(1)} minutes while actively downloading`,
        details: {
          stalledMinutes: stalledMinutes.toFixed(1),
          progressChange: (totalProgressChange * 100).toFixed(2) + "%",
          downloadSpeed: this.formatSpeed(metrics.downloadSpeed),
          currentProgress: (metrics.currentProgress * 100).toFixed(2) + "%",
        },
        scoreImpact,
      };
    }

    return null;
  }

  /**
   * Detect impossible download speed (progress increases faster than network allows)
   */
  private detectImpossibleSpeed(
    metrics: PeerMetrics,
    torrentSize: number,
  ): Violation | null {
    if (metrics.progressHistory.length < 2) return null;

    const recentHistory = metrics.progressHistory.slice(-2);
    const timeDiff =
      (recentHistory[1].timestamp.getTime() -
        recentHistory[0].timestamp.getTime()) /
      1000;
    const progressDiff = recentHistory[1].progress - recentHistory[0].progress;

    if (timeDiff < 1 || progressDiff <= 0) return null;

    const bytesForProgress = progressDiff * torrentSize;
    const requiredSpeed = bytesForProgress / timeDiff;
    const actualSpeed = metrics.downloadSpeed;

    // Skip if actual speed is too low (might be measurement issue)
    if (actualSpeed < 1000) return null;

    const speedRatio = requiredSpeed / actualSpeed;

    if (speedRatio > this.config.impossibleSpeedMultiplier) {
      const severity = this.getSeverity(speedRatio, [2, 5, 10]);
      const scoreImpact = this.getScoreImpact(severity);

      return {
        type: "impossible_speed" as ViolationType,
        timestamp: new Date(),
        severity,
        description: `Impossible progress: Progress increased ${speedRatio.toFixed(1)}x faster than download speed allows`,
        details: {
          requiredSpeed: this.formatSpeed(requiredSpeed),
          actualSpeed: this.formatSpeed(actualSpeed),
          speedRatio: speedRatio.toFixed(2),
          progressChange: (progressDiff * 100).toFixed(2) + "%",
          timePeriod: timeDiff.toFixed(1) + "s",
        },
        scoreImpact,
      };
    }

    return null;
  }

  /**
   * Detect peer claiming 100% but still downloading
   */
  private detectCompleteAnomaly(metrics: PeerMetrics): Violation | null {
    const isComplete = metrics.currentProgress >= 0.99;
    const stillDownloading = metrics.downloadSpeed > 1000; // >1KB/s

    if (isComplete && stillDownloading) {
      return {
        type: "complete_but_downloading" as ViolationType,
        timestamp: new Date(),
        severity: "critical",
        description: `Peer claims 100% complete but still downloading at ${this.formatSpeed(metrics.downloadSpeed)}`,
        details: {
          progress: (metrics.currentProgress * 100).toFixed(2) + "%",
          downloadSpeed: this.formatSpeed(metrics.downloadSpeed),
          downloaded: this.formatBytes(metrics.totalDownloaded),
        },
        scoreImpact: 40,
      };
    }

    return null;
  }

  /**
   * Detect zero progress long-term leecher
   */
  private detectZeroProgressLeecher(metrics: PeerMetrics): Violation | null {
    const minutesTracked = metrics.connectionDuration / 60;
    const totalDownloadedMB = metrics.totalDownloaded / 1024 / 1024;
    const progressPercent = metrics.currentProgress * 100;

    // Peer has downloaded significant data but progress is still near zero
    if (progressPercent < 5 && totalDownloadedMB > 50 && minutesTracked > 5) {
      const severity = this.getSeverity(totalDownloadedMB, [50, 100, 200]);
      const scoreImpact = this.getScoreImpact(severity);

      return {
        type: "zero_progress_leecher" as ViolationType,
        timestamp: new Date(),
        severity,
        description: `Downloaded ${totalDownloadedMB.toFixed(1)}MB but still at ${progressPercent.toFixed(1)}% after ${minutesTracked.toFixed(1)} minutes`,
        details: {
          progress: progressPercent.toFixed(2) + "%",
          downloaded: totalDownloadedMB.toFixed(2) + " MB",
          trackingMinutes: minutesTracked.toFixed(1),
          uploadRatio: metrics.uploadRatio.toFixed(2),
        },
        scoreImpact,
      };
    }

    return null;
  }

  /**
   * Determine severity based on thresholds
   */
  private getSeverity(
    value: number,
    thresholds: [number, number, number],
  ): "low" | "medium" | "high" | "critical" {
    if (value >= thresholds[2]) return "critical";
    if (value >= thresholds[1]) return "high";
    if (value >= thresholds[0]) return "medium";
    return "low";
  }

  /**
   * Get score impact based on severity
   */
  private getScoreImpact(
    severity: "low" | "medium" | "high" | "critical",
  ): number {
    switch (severity) {
      case "low":
        return 10;
      case "medium":
        return 20;
      case "high":
        return 30;
      case "critical":
        return 40;
    }
  }

  /**
   * Format bytes to human readable
   */
  private formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    if (bytes < 1024 * 1024 * 1024)
      return (bytes / 1024 / 1024).toFixed(2) + " MB";
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + " GB";
  }

  /**
   * Format speed to human readable
   */
  private formatSpeed(bytesPerSec: number): string {
    return this.formatBytes(bytesPerSec) + "/s";
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SmartDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
