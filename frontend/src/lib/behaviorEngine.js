/**
 * Client-side Behavior Tracking Engine (#2)
 *
 * Captures user interaction signals (query patterns, navigation, connection switches),
 * compacts them into abstract intents every 15 minutes, and purges raw signals.
 * Compacted intents are sent to the server for profile storage.
 *
 * Privacy model:
 * - Raw signals NEVER leave the browser
 * - Only compacted abstract intents are sent to server
 * - Pre-capture consent gate: nothing captured until user opts in
 * - Session-only raw storage (sessionStorage), auto-purged on close
 * - BroadcastChannel for multi-tab coordination (leader election)
 */

import { api } from "../api";

// ── Configuration ────────────────────────────────────────────────
const COMPACTION_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_RAW_SIGNALS = 500; // Cap raw buffer to prevent memory issues
const STORAGE_KEY = "qc_behavior_raw";
const LEADER_KEY = "qc_behavior_leader";
const LEADER_HEARTBEAT_MS = 5000;

// ── Signal Types ──────────────────────────────────────────────────
// We capture high-level interaction signals, NOT micro-signals like hover/typing.
// Phase 1: Only explicit actions. Phase 2 (with consent) adds richer signals.

/**
 * @typedef {Object} RawSignal
 * @property {string} type - Signal type
 * @property {string} value - Signal value (abstracted, never raw PII)
 * @property {number} ts - Timestamp (epoch ms)
 */

class BehaviorEngine {
  constructor() {
    this._signals = [];
    this._compactionTimer = null;
    this._leaderChannel = null;
    this._isLeader = false;
    this._heartbeatTimer = null;
    this._enabled = false;
    this._consentLevel = 0; // 0=none, 1=personal, 2=collaborative
  }

  /**
   * Initialize the engine. Only starts capturing if user has consented.
   * @param {number} consentLevel - 0=off, 1=personal tracking, 2=collaborative
   */
  init(consentLevel = 0) {
    this._consentLevel = consentLevel;
    if (consentLevel === 0) {
      this.stop();
      return;
    }

    this._enabled = true;

    // Restore raw signals from sessionStorage (survives page refresh within session)
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) this._signals = JSON.parse(raw);
    } catch { /* ignore corrupt data */ }

    // Multi-tab leader election via BroadcastChannel
    this._electLeader();

    // Start compaction timer
    this._compactionTimer = setInterval(() => this._compact(), COMPACTION_INTERVAL_MS);

    // Compact on page unload (best-effort)
    window.addEventListener("beforeunload", () => this._compact());
  }

  stop() {
    this._enabled = false;
    if (this._compactionTimer) clearInterval(this._compactionTimer);
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
    if (this._leaderChannel) this._leaderChannel.close();
    this._compactionTimer = null;
    this._heartbeatTimer = null;
    this._leaderChannel = null;
  }

  // ── Signal Recording ────────────────────────────────────────────

  /**
   * Record a query event (what the user asked + which tables were hit)
   */
  trackQuery(question, tables = [], connId = "") {
    if (!this._enabled) return;
    this._addSignal("query", {
      topic: this._abstractTopic(question),
      tables: tables.slice(0, 5),
      connId: connId || "",
    });
  }

  /**
   * Record a connection switch
   */
  trackConnectionSwitch(fromConnId, toConnId) {
    if (!this._enabled) return;
    this._addSignal("conn_switch", { from: fromConnId, to: toConnId });
  }

  /**
   * Record navigation (which page/section the user visited)
   */
  trackNavigation(page) {
    if (!this._enabled) return;
    this._addSignal("navigate", { page });
  }

  /**
   * Record dashboard interaction (which tile was clicked/expanded)
   */
  trackDashboardInteraction(tileId, action = "view") {
    if (!this._enabled) return;
    this._addSignal("dashboard", { tileId, action });
  }

  /**
   * Record suggestion interaction (which prediction was clicked or ignored)
   */
  trackPredictionFeedback(predictionIndex, clicked = false) {
    if (!this._enabled) return;
    this._addSignal("prediction_feedback", { index: predictionIndex, clicked });
  }

  // ── Internal Methods ────────────────────────────────────────────

  _addSignal(type, value) {
    if (this._signals.length >= MAX_RAW_SIGNALS) {
      // Buffer full — force compaction
      this._compact();
    }
    this._signals.push({ type, value, ts: Date.now() });
    this._persist();
  }

  _persist() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this._signals));
    } catch { /* quota exceeded — compact now */
      this._compact();
    }
  }

  /**
   * Abstract a question into a topic category to prevent PII leakage.
   * "What's the revenue for patient John Doe?" → "revenue_analysis"
   * This runs BEFORE any data leaves the browser.
   */
  _abstractTopic(question) {
    if (!question) return "unknown";
    const q = question.toLowerCase();

    // Map to abstract categories (never store the actual question)
    const categories = [
      { pattern: /revenue|sales|income|earning/i, topic: "revenue_analysis" },
      { pattern: /cost|expense|spend|budget/i, topic: "cost_analysis" },
      { pattern: /customer|user|client|account/i, topic: "customer_analysis" },
      { pattern: /product|item|sku|catalog/i, topic: "product_analysis" },
      { pattern: /time|trend|growth|decline|over time/i, topic: "trend_analysis" },
      { pattern: /compare|vs|versus|difference/i, topic: "comparison" },
      { pattern: /anomal|outlier|unusual|spike/i, topic: "anomaly_detection" },
      { pattern: /top|best|worst|rank|leader/i, topic: "ranking" },
      { pattern: /count|total|sum|average|aggregate/i, topic: "aggregation" },
      { pattern: /segment|group|categor|breakdown/i, topic: "segmentation" },
    ];

    for (const { pattern, topic } of categories) {
      if (pattern.test(q)) return topic;
    }
    return "general_query";
  }

  /**
   * Compact raw signals into abstract intent summary.
   * Purges raw signals after compaction.
   */
  _compact() {
    if (!this._signals.length) return;
    if (!this._isLeader) return; // Only leader compacts

    const signals = [...this._signals];
    this._signals = [];
    sessionStorage.removeItem(STORAGE_KEY);

    // Build compacted profile delta
    const delta = this._buildDelta(signals);

    // Send to server (fire-and-forget)
    api.submitBehaviorDelta(delta).catch(() => {
      // Server unavailable — signals are lost (privacy-by-design)
    });
  }

  /**
   * Build a compacted delta from raw signals.
   * Returns ONLY abstract intents — no PII, no raw questions, no timestamps.
   */
  _buildDelta(signals) {
    const topicCounts = {};
    const connSwitches = [];
    const pages = {};
    const dashboardActions = {};
    let predictionClicks = 0;
    let predictionShows = 0;

    for (const sig of signals) {
      switch (sig.type) {
        case "query": {
          const topic = sig.value?.topic || "unknown";
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
          break;
        }
        case "conn_switch":
          connSwitches.push({ from: sig.value?.from, to: sig.value?.to });
          break;
        case "navigate":
          pages[sig.value?.page] = (pages[sig.value?.page] || 0) + 1;
          break;
        case "dashboard":
          dashboardActions[sig.value?.action] = (dashboardActions[sig.value?.action] || 0) + 1;
          break;
        case "prediction_feedback":
          predictionShows++;
          if (sig.value?.clicked) predictionClicks++;
          break;
      }
    }

    return {
      session_signals: signals.length,
      topic_interests: topicCounts,
      connection_patterns: connSwitches.slice(-5),
      page_visits: pages,
      dashboard_usage: dashboardActions,
      prediction_accuracy: predictionShows > 0 ? predictionClicks / predictionShows : null,
      compacted_at: new Date().toISOString(),
    };
  }

  // ── Multi-Tab Leader Election ───────────────────────────────────

  _electLeader() {
    try {
      this._leaderChannel = new BroadcastChannel("qc_behavior_leader");
      this._isLeader = true; // Assume leader until challenged

      this._leaderChannel.onmessage = (e) => {
        if (e.data?.type === "leader_claim" && e.data.ts > this._leaderTs) {
          this._isLeader = false;
        }
      };

      // Claim leadership
      this._leaderTs = Date.now();
      this._leaderChannel.postMessage({ type: "leader_claim", ts: this._leaderTs });

      // Heartbeat to maintain leadership
      this._heartbeatTimer = setInterval(() => {
        if (this._isLeader) {
          this._leaderChannel.postMessage({ type: "leader_claim", ts: this._leaderTs });
        }
      }, LEADER_HEARTBEAT_MS);
    } catch {
      // BroadcastChannel not available — this tab is the sole leader
      this._isLeader = true;
    }
  }
}

// Singleton instance
const behaviorEngine = new BehaviorEngine();
export default behaviorEngine;
