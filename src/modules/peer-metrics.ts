/**
 * @since 2025/01/27
 * @author ThinhHV <thinh@thinhhv.com>
 * @description Peer metrics tracking and management
 * @copyright (c) 2025 ThinhHV Platform
 */

import type { PeerMetrics, PeerInfo, Violation } from "../types.ts";

/**
 * Manages peer metrics tracking across torrents
 */
export class PeerMetricsTracker {
  private peers: Map<string, PeerMetrics> = new Map();
  private maxHistoryPoints: number;

  constructor(maxHistoryPoints: number = 100) {
    this.maxHistoryPoints = maxHistoryPoints;
  }

  /**
   * Generate unique key for peer + torrent combination
   */
  private getKey(ip: string, torrentHash: string): string {
    return `${ip}:${torrentHash}`;
  }

  /**
   * Update or create peer metrics
   */
  updatePeer(
    peer: PeerInfo,
    torrentHash: string,
    torrentSize: number,
  ): PeerMetrics {
    const key = this.getKey(peer.ip, torrentHash);
    const now = new Date();

    let metrics = this.peers.get(key);

    if (!metrics) {
      // Create new peer metrics
      metrics = this.createNewMetrics(peer, torrentHash, now);
      this.peers.set(key, metrics);
    } else {
      // Update existing metrics
      this.updateExistingMetrics(metrics, peer, now, torrentSize);
    }

    return metrics;
  }

  /**
   * Create new peer metrics entry
   */
  private createNewMetrics(
    peer: PeerInfo,
    torrentHash: string,
    now: Date,
  ): PeerMetrics {
    return {
      ip: peer.ip,
      torrentHash,
      client: peer.client,
      firstSeen: now,
      lastSeen: now,
      connectionDuration: 0,
      connectionCount: 1,
      disconnectionCount: 0,
      totalDownloaded: peer.downloaded,
      totalUploaded: peer.uploaded,
      downloadSpeed: peer.dl_speed,
      uploadSpeed: peer.up_speed,
      uploadRatio: peer.uploaded / Math.max(peer.downloaded, 1),
      currentProgress: peer.progress,
      progressHistory: [
        {
          timestamp: now,
          progress: peer.progress,
          downloaded: peer.downloaded,
          uploaded: peer.uploaded,
          downloadSpeed: peer.dl_speed,
          uploadSpeed: peer.up_speed,
        },
      ],
      pieceRequests: 0,
      pieceCompleted: 0,
      pieceAbandonRate: 0,
      behaviorScore: 50, // Start neutral
      suspicionScore: 0,
      violations: [],
      isWhitelisted: false,
      isFlagged: false,
    };
  }

  /**
   * Update existing peer metrics
   */
  private updateExistingMetrics(
    metrics: PeerMetrics,
    peer: PeerInfo,
    now: Date,
    torrentSize: number,
  ): void {
    const timeSinceLastSeen =
      (now.getTime() - metrics.lastSeen.getTime()) / 1000;

    // Update timing
    metrics.lastSeen = now;
    metrics.connectionDuration =
      (now.getTime() - metrics.firstSeen.getTime()) / 1000;

    // Detect reconnection (gap > 30 seconds)
    if (timeSinceLastSeen > 30) {
      metrics.connectionCount++;
    }

    // Update transfer stats
    const downloadedDelta = Math.max(
      0,
      peer.downloaded - metrics.totalDownloaded,
    );
    const uploadedDelta = Math.max(0, peer.uploaded - metrics.totalUploaded);

    metrics.totalDownloaded = peer.downloaded;
    metrics.totalUploaded = peer.uploaded;
    metrics.downloadSpeed = peer.dl_speed;
    metrics.uploadSpeed = peer.up_speed;
    metrics.uploadRatio =
      metrics.totalUploaded / Math.max(metrics.totalDownloaded, 1);

    // Update progress
    const progressChanged = peer.progress !== metrics.currentProgress;
    metrics.currentProgress = peer.progress;

    // Add to progress history if changed or enough time passed
    const lastSnapshot =
      metrics.progressHistory[metrics.progressHistory.length - 1];
    const timeSinceLastSnapshot =
      (now.getTime() - lastSnapshot.timestamp.getTime()) / 1000;

    if (progressChanged || timeSinceLastSnapshot >= 30) {
      metrics.progressHistory.push({
        timestamp: now,
        progress: peer.progress,
        downloaded: peer.downloaded,
        uploaded: peer.uploaded,
        downloadSpeed: peer.dl_speed,
        uploadSpeed: peer.up_speed,
      });

      // Limit history size
      if (metrics.progressHistory.length > this.maxHistoryPoints) {
        metrics.progressHistory.shift();
      }
    }

    // Estimate piece request metrics (heuristic based on download activity)
    if (downloadedDelta > 0) {
      // Approximate piece requests based on downloaded data
      // Typical piece size is 256KB to 16MB, use 1MB as average
      const estimatedRequests = Math.floor(downloadedDelta / (1024 * 1024));
      metrics.pieceRequests += estimatedRequests;
      metrics.pieceCompleted += estimatedRequests; // Assume completed if downloaded
    }

    // Update abandon rate
    if (metrics.pieceRequests > 0) {
      metrics.pieceAbandonRate =
        (metrics.pieceRequests - metrics.pieceCompleted) /
        metrics.pieceRequests;
    }

    // Update client if changed
    if (peer.client && peer.client !== "unknown") {
      metrics.client = peer.client;
    }
  }

  /**
   * Get peer metrics
   */
  getPeer(ip: string, torrentHash: string): PeerMetrics | undefined {
    return this.peers.get(this.getKey(ip, torrentHash));
  }

  /**
   * Get all peers for a torrent
   */
  getPeersForTorrent(torrentHash: string): PeerMetrics[] {
    return Array.from(this.peers.values()).filter(
      (p) => p.torrentHash === torrentHash,
    );
  }

  /**
   * Get all tracked peers
   */
  getAllPeers(): PeerMetrics[] {
    return Array.from(this.peers.values());
  }

  /**
   * Add violation to peer
   */
  addViolation(ip: string, torrentHash: string, violation: Violation): void {
    const peer = this.getPeer(ip, torrentHash);
    if (peer) {
      peer.violations.push(violation);
      peer.suspicionScore += violation.scoreImpact;
      peer.isFlagged = true;
      peer.lastAnalysis = new Date();
    }
  }

  /**
   * Update peer scores
   */
  updateScores(
    ip: string,
    torrentHash: string,
    behaviorScore: number,
    suspicionScore: number,
  ): void {
    const peer = this.getPeer(ip, torrentHash);
    if (peer) {
      peer.behaviorScore = behaviorScore;
      peer.suspicionScore = suspicionScore;
      peer.lastAnalysis = new Date();
    }
  }

  /**
   * Whitelist a peer
   */
  whitelistPeer(ip: string, torrentHash: string): void {
    const peer = this.getPeer(ip, torrentHash);
    if (peer) {
      peer.isWhitelisted = true;
      peer.isFlagged = false;
      peer.suspicionScore = 0;
    }
  }

  /**
   * Check if peer is whitelisted
   */
  isWhitelisted(ip: string, torrentHash: string): boolean {
    const peer = this.getPeer(ip, torrentHash);
    return peer?.isWhitelisted || false;
  }

  /**
   * Get peers by IP across all torrents
   */
  getPeersByIP(ip: string): PeerMetrics[] {
    return Array.from(this.peers.values()).filter((p) => p.ip === ip);
  }

  /**
   * Calculate average behavior score for IP across torrents
   */
  getAverageBehaviorScore(ip: string): number {
    const peers = this.getPeersByIP(ip);
    if (peers.length === 0) return 50;

    const sum = peers.reduce((acc, p) => acc + p.behaviorScore, 0);
    return sum / peers.length;
  }

  /**
   * Clean up old peer data
   */
  cleanup(maxAgeMinutes: number = 60): number {
    const now = new Date();
    let cleaned = 0;

    for (const [key, peer] of this.peers.entries()) {
      const ageMinutes = (now.getTime() - peer.lastSeen.getTime()) / 1000 / 60;
      if (ageMinutes > maxAgeMinutes) {
        this.peers.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalPeers: number;
    activePeers: number;
    whitelistedPeers: number;
    flaggedPeers: number;
    averageBehaviorScore: number;
    averageSuspicionScore: number;
    averageUploadRatio: number;
  } {
    const peers = this.getAllPeers();
    const now = new Date();

    const activePeers = peers.filter(
      (p) => (now.getTime() - p.lastSeen.getTime()) / 1000 < 300,
    ).length; // Active in last 5 minutes

    const whitelistedPeers = peers.filter((p) => p.isWhitelisted).length;
    const flaggedPeers = peers.filter((p) => p.isFlagged).length;

    const avgBehavior =
      peers.reduce((sum, p) => sum + p.behaviorScore, 0) / peers.length || 50;
    const avgSuspicion =
      peers.reduce((sum, p) => sum + p.suspicionScore, 0) / peers.length || 0;
    const avgRatio =
      peers.reduce((sum, p) => sum + p.uploadRatio, 0) / peers.length || 0;

    return {
      totalPeers: peers.length,
      activePeers,
      whitelistedPeers,
      flaggedPeers,
      averageBehaviorScore: Math.round(avgBehavior),
      averageSuspicionScore: Math.round(avgSuspicion),
      averageUploadRatio: Math.round(avgRatio * 100) / 100,
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.peers.clear();
  }

  /**
   * Get peer count
   */
  get size(): number {
    return this.peers.size;
  }
}
