/**
 * @since 2025/01/27
 * @author ThinhHV <thinh@thinhhv.com>
 * @description Rate-based detection for upload/download behavior
 * @copyright (c) 2025 ThinhHV Platform
 */

import type {
  PeerMetrics,
  Violation,
  ViolationType,
  SmartDetectionConfig,
} from "../types.ts";

/**
 * Detects rate-based violations (upload/download patterns)
 */
export class RateDetector {
  private config: SmartDetectionConfig;

  constructor(config: SmartDetectionConfig) {
    this.config = config;
  }

  /**
   * Detect all rate-based violations
   */
  detectViolations(metrics: PeerMetrics): Violation[] {
    if (!this.config.enableRateDetection) {
      return [];
    }

    const violations: Violation[] = [];

    // 1. Zero Upload Detection
    const zeroUploadViolation = this.detectZeroUpload(metrics);
    if (zeroUploadViolation) violations.push(zeroUploadViolation);

    // 2. Hit and Run Detection
    const hitAndRunViolation = this.detectHitAndRun(metrics);
    if (hitAndRunViolation) violations.push(hitAndRunViolation);

    // 3. Suspicious Upload Ratio
    const ratioViolation = this.detectSuspiciousRatio(metrics);
    if (ratioViolation) violations.push(ratioViolation);

    // 4. Rapid Disconnect Pattern
    const disconnectViolation = this.detectRapidDisconnect(metrics);
    if (disconnectViolation) violations.push(disconnectViolation);

    return violations;
  }

  /**
   * Detect zero upload after grace period
   */
  private detectZeroUpload(metrics: PeerMetrics): Violation | null {
    const durationMinutes = metrics.connectionDuration / 60;
    const downloadedMB = metrics.totalDownloaded / 1024 / 1024;
    const uploadedMB = metrics.totalUploaded / 1024 / 1024;

    // Grace period check
    const pastGracePeriod = durationMinutes > this.config.gracePeriodMinutes;
    const downloadedEnough = downloadedMB > this.config.minUploadAfterMB;
    const hasProgress = metrics.currentProgress > 0.05; // >5% progress

    if (
      pastGracePeriod &&
      downloadedEnough &&
      uploadedMB < 0.1 &&
      hasProgress
    ) {
      const severity = this.getSeverity(downloadedMB, [100, 500, 1000]);
      const scoreImpact = this.getScoreImpact(severity);

      return {
        type: "zero_upload" as ViolationType,
        timestamp: new Date(),
        severity,
        description: `Zero upload after ${durationMinutes.toFixed(0)} minutes and ${downloadedMB.toFixed(1)}MB downloaded`,
        details: {
          durationMinutes: durationMinutes.toFixed(1),
          downloaded: downloadedMB.toFixed(2) + " MB",
          uploaded: uploadedMB.toFixed(2) + " MB",
          progress: (metrics.currentProgress * 100).toFixed(2) + "%",
          gracePeriodMinutes: this.config.gracePeriodMinutes,
        },
        scoreImpact,
      };
    }

    return null;
  }

  /**
   * Detect hit and run behavior (quick disconnect after download)
   */
  private detectHitAndRun(metrics: PeerMetrics): Violation | null {
    const durationMinutes = metrics.connectionDuration / 60;
    const downloadedMB = metrics.totalDownloaded / 1024 / 1024;
    const uploadRatio = metrics.uploadRatio;

    // Hit and run criteria:
    // - Short connection (<5 minutes)
    // - Downloaded significant data (>50MB)
    // - Very low upload ratio (<0.1)
    // - Currently not connected (would need to track this separately)

    const shortConnection = durationMinutes < this.config.minConnectionMinutes;
    const significantDownload = downloadedMB > 50;
    const poorRatio = uploadRatio < 0.1;

    if (shortConnection && significantDownload && poorRatio) {
      return {
        type: "hit_and_run" as ViolationType,
        timestamp: new Date(),
        severity: "high",
        description: `Hit-and-run: Downloaded ${downloadedMB.toFixed(1)}MB in ${durationMinutes.toFixed(1)} minutes with ${(uploadRatio * 100).toFixed(1)}% ratio`,
        details: {
          durationMinutes: durationMinutes.toFixed(1),
          downloaded: downloadedMB.toFixed(2) + " MB",
          uploadRatio: uploadRatio.toFixed(3),
          minConnectionMinutes: this.config.minConnectionMinutes,
        },
        scoreImpact: 25,
      };
    }

    return null;
  }

  /**
   * Detect suspicious upload ratio patterns
   */
  private detectSuspiciousRatio(metrics: PeerMetrics): Violation | null {
    const uploadRatio = metrics.uploadRatio;
    const progress = metrics.currentProgress;
    const downloadedMB = metrics.totalDownloaded / 1024 / 1024;

    // Peers with >50% progress should be uploading
    if (
      progress > 0.5 &&
      uploadRatio < 0.05 &&
      downloadedMB > this.config.minUploadAfterMB
    ) {
      const severity = this.getSeverity(progress * 100, [50, 70, 90]);
      const scoreImpact = Math.min(15, Math.floor(progress * 20));

      return {
        type: "suspicious_ratio" as ViolationType,
        timestamp: new Date(),
        severity,
        description: `No upload at ${(progress * 100).toFixed(0)}% progress: Upload ratio is only ${(uploadRatio * 100).toFixed(1)}%`,
        details: {
          progress: (progress * 100).toFixed(2) + "%",
          uploadRatio: uploadRatio.toFixed(3),
          downloaded: downloadedMB.toFixed(2) + " MB",
          uploaded: (metrics.totalUploaded / 1024 / 1024).toFixed(2) + " MB",
          expectedMinRatio: this.config.minUploadRatio,
        },
        scoreImpact,
      };
    }

    return null;
  }

  /**
   * Detect rapid disconnect/reconnect patterns
   */
  private detectRapidDisconnect(metrics: PeerMetrics): Violation | null {
    const disconnectRate =
      metrics.disconnectionCount / Math.max(metrics.connectionCount, 1);
    const avgConnectionTime =
      metrics.connectionDuration / Math.max(metrics.connectionCount, 1);

    // High reconnection rate with short average connection time
    const highReconnectRate = disconnectRate > 0.5;
    const shortAvgConnection =
      avgConnectionTime < this.config.rapidDisconnectThresholdSec;
    const multipleConnections = metrics.connectionCount >= 3;

    if (highReconnectRate && shortAvgConnection && multipleConnections) {
      return {
        type: "rapid_disconnect" as ViolationType,
        timestamp: new Date(),
        severity: "medium",
        description: `Rapid disconnect pattern: ${metrics.disconnectionCount} disconnects in ${metrics.connectionCount} connections`,
        details: {
          connectionCount: metrics.connectionCount,
          disconnectionCount: metrics.disconnectionCount,
          disconnectRate: disconnectRate.toFixed(2),
          avgConnectionTimeSec: avgConnectionTime.toFixed(1),
          thresholdSec: this.config.rapidDisconnectThresholdSec,
        },
        scoreImpact: 15,
      };
    }

    return null;
  }

  /**
   * Check upload/download speed thresholds
   */
  checkSpeedThresholds(metrics: PeerMetrics): {
    tooSlow: boolean;
    tooFast: boolean;
    details: Record<string, any>;
  } {
    const downloadSpeedKBps = metrics.downloadSpeed / 1024;
    const uploadSpeedKBps = metrics.uploadSpeed / 1024;

    const tooSlow =
      downloadSpeedKBps > 0 &&
      downloadSpeedKBps < this.config.minAverageSpeedKBps;
    const tooFast =
      this.config.maxAverageSpeedKBps > 0 &&
      downloadSpeedKBps > this.config.maxAverageSpeedKBps;

    return {
      tooSlow,
      tooFast,
      details: {
        downloadSpeed: downloadSpeedKBps.toFixed(2) + " KB/s",
        uploadSpeed: uploadSpeedKBps.toFixed(2) + " KB/s",
        minThreshold: this.config.minAverageSpeedKBps + " KB/s",
        maxThreshold:
          this.config.maxAverageSpeedKBps > 0
            ? this.config.maxAverageSpeedKBps + " KB/s"
            : "unlimited",
      },
    };
  }

  /**
   * Calculate upload requirement based on progress
   */
  calculateExpectedUpload(
    downloaded: number,
    progress: number,
  ): {
    expected: number;
    actual: number;
    deficit: number;
    meetsRequirement: boolean;
  } {
    // As peer progresses, expect increasing upload contribution
    let expectedRatio = this.config.minUploadRatio;

    if (progress > 0.5) {
      expectedRatio = Math.min(0.5, this.config.minUploadRatio * 2);
    }
    if (progress > 0.8) {
      expectedRatio = Math.min(0.8, this.config.minUploadRatio * 3);
    }
    if (progress >= 1.0) {
      expectedRatio = 1.0;
    }

    const expected = downloaded * expectedRatio;
    const actual = downloaded; // Would need actual upload value
    const deficit = Math.max(0, expected - actual);

    return {
      expected,
      actual,
      deficit,
      meetsRequirement: deficit === 0,
    };
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
   * Update configuration
   */
  updateConfig(config: Partial<SmartDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
