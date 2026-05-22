// ══════════════════════════════════════════════════════════════════
// ResqNet AI — Connectivity Manager
// Detects online/offline/degraded states and manages subscriptions.
// ══════════════════════════════════════════════════════════════════

export type ConnectivityStatus = 'online' | 'offline' | 'degraded';

type StatusCallback = (status: ConnectivityStatus) => void;

class _ConnectivityManager {
  private _status: ConnectivityStatus = 'online';
  private _lastOnline: Date | null = new Date();
  private _backendHealthy = true;
  private _listeners: Set<StatusCallback> = new Set();
  private _healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      // Set initial state
      this._status = navigator.onLine ? 'online' : 'offline';
      if (navigator.onLine) this._lastOnline = new Date();

      window.addEventListener('online', () => this._handleOnline());
      window.addEventListener('offline', () => this._handleOffline());

      // Periodic backend health check every 30s
      this._healthCheckInterval = setInterval(() => {
        if (navigator.onLine) {
          this.checkBackendHealth();
        }
      }, 30000);
    }
  }

  private _handleOnline(): void {
    this._lastOnline = new Date();
    // Check if backend is also reachable
    this.checkBackendHealth().then(healthy => {
      const newStatus: ConnectivityStatus = healthy ? 'online' : 'degraded';
      this._updateStatus(newStatus);
    });
  }

  private _handleOffline(): void {
    this._updateStatus('offline');
  }

  private _updateStatus(newStatus: ConnectivityStatus): void {
    if (newStatus !== this._status) {
      this._status = newStatus;
      if (newStatus === 'online') this._lastOnline = new Date();
      this._listeners.forEach(cb => {
        try { cb(newStatus); } catch (e) { console.error('[Connectivity] Listener error:', e); }
      });
    }
  }

  /** Current online status from browser API */
  isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  /** Get current mode: online / offline / degraded */
  getMode(): ConnectivityStatus {
    return this._status;
  }

  /** Ping the backend to verify it's reachable (3s timeout) */
  async checkBackendHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const resp = await fetch('http://localhost:5000/api/weather?lat=19&lon=72', {
        signal: controller.signal
      });
      clearTimeout(timeout);

      this._backendHealthy = resp.ok;
      if (resp.ok && this._status === 'degraded') {
        this._updateStatus('online');
      }
      return resp.ok;
    } catch {
      this._backendHealthy = false;
      if (this.isOnline() && this._status !== 'offline') {
        this._updateStatus('degraded');
      }
      return false;
    }
  }

  /** Is the Express backend reachable? */
  isBackendHealthy(): boolean {
    return this._backendHealthy;
  }

  /** Subscribe to status changes. Returns unsubscribe function. */
  onStatusChange(callback: StatusCallback): () => void {
    this._listeners.add(callback);
    return () => { this._listeners.delete(callback); };
  }

  /** Last time we were fully online */
  getLastOnlineTime(): Date | null {
    return this._lastOnline;
  }

  /** Seconds since last fully-online state */
  getOfflineDuration(): number {
    if (this._status === 'online') return 0;
    if (!this._lastOnline) return 0;
    return Math.floor((Date.now() - this._lastOnline.getTime()) / 1000);
  }

  /** Clean up intervals on shutdown */
  destroy(): void {
    if (this._healthCheckInterval) {
      clearInterval(this._healthCheckInterval);
    }
    this._listeners.clear();
  }
}

/** Singleton connectivity manager */
export const ConnectivityManager = new _ConnectivityManager();
