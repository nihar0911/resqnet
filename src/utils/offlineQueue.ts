// ══════════════════════════════════════════════════════════════════
// ResqNet AI — Offline SMS Queue
// Queues SMS messages when offline, auto-flushes when back online.
// ══════════════════════════════════════════════════════════════════

export interface QueuedSMS {
  id: string;
  phone: string;
  message: string;
  timestamp: number;
  attempts: number;
}

export interface FlushResult {
  sent: number;
  failed: number;
  remaining: number;
}

const QUEUE_KEY = 'resqnet_sms_queue';

function loadQueue(): QueuedSMS[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedSMS[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('[SMSQueue] Failed to save:', e);
  }
}

/** Add an SMS to the offline queue */
export function queueSMS(phone: string, message: string): void {
  const queue = loadQueue();
  queue.push({
    id: `sms-q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    phone,
    message,
    timestamp: Date.now(),
    attempts: 0
  });
  saveQueue(queue);
  console.log(`[SMSQueue] Queued SMS for ${phone} (${queue.length} in queue)`);
}

/** Get all queued messages */
export function getQueuedMessages(): QueuedSMS[] {
  return loadQueue();
}

/** Get count of queued messages */
export function getQueueLength(): number {
  return loadQueue().length;
}

/** Clear the entire queue */
export function clearQueue(): void {
  saveQueue([]);
}

/** Flush the queue — send all pending SMS via backend, remove successful ones */
export async function flushQueue(): Promise<FlushResult> {
  const queue = loadQueue();
  if (queue.length === 0) return { sent: 0, failed: 0, remaining: 0 };

  let sent = 0;
  let failed = 0;
  const remaining: QueuedSMS[] = [];

  for (const sms of queue) {
    try {
      const resp = await fetch('http://localhost:5000/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: sms.phone, message: sms.message })
      });

      if (resp.ok) {
        sent++;
        console.log(`[SMSQueue] ✅ Flushed SMS to ${sms.phone}`);
      } else {
        sms.attempts++;
        remaining.push(sms);
        failed++;
      }
    } catch {
      sms.attempts++;
      remaining.push(sms);
      failed++;
    }
  }

  saveQueue(remaining);
  console.log(`[SMSQueue] Flush complete: ${sent} sent, ${failed} failed, ${remaining.length} remaining`);
  return { sent, failed, remaining: remaining.length };
}

// ── Auto-flush when coming back online ───────────────────────────
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[SMSQueue] Network restored — flushing queued messages...');
    flushQueue().then(result => {
      if (result.sent > 0) {
        console.log(`[SMSQueue] Auto-flushed ${result.sent} queued SMS on reconnect.`);
      }
    });
  });
}
