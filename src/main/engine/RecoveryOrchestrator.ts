import { EventEmitter } from 'events';
import { DownloadItem, DownloadError } from '../../shared/types';
import { ServerPolicyEngine } from './ServerPolicyEngine';
import { AppDatabase } from '../db/Database';
import { RecoveryJournal } from '../db/RecoveryJournal';

export type FailureCategory =
  | 'NETWORK_FAILURE'
  | 'SERVER_FAILURE'
  | 'STORAGE_FAILURE'
  | 'RESOURCE_FAILURE'
  | 'STALL_FAILURE'
  | 'UNKNOWN_FAILURE';

export type RecoveryStrategyAction =
  | 'RETRY_WITH_BACKOFF'
  | 'ADAPTIVE_AIMD_BACKOFF'
  | 'RESTART_STALLED_SOCKETS'
  | 'PAUSE_AND_EXPLAIN'
  | 'FALLBACK_SINGLE_STREAM'
  | 'ABORT_UNRECOVERABLE';

export interface RecoveryDecision {
  category: FailureCategory;
  action: RecoveryStrategyAction;
  explanation: string;
  recommendedActionUser: string;
  backoffMs: number;
  newConnectionCount?: number;
  retryCount: number;
}

export class RecoveryOrchestrator extends EventEmitter {
  private policyEngine: ServerPolicyEngine;
  private db: AppDatabase;

  constructor(policyEngine: ServerPolicyEngine, db: AppDatabase) {
    super();
    this.policyEngine = policyEngine;
    this.db = db;
  }

  public evaluateFailure(item: DownloadItem, error: Error | any): RecoveryDecision {
    const errorMsg = (error.message || String(error)).toLowerCase();
    const domain = this.policyEngine.getDomainFromUrl(item.url);
    const retryCount = item.retryCount || 0;

    // 1. Server Throttling (429 or 503)
    if (errorMsg.includes('429') || errorMsg.includes('too many requests') || errorMsg.includes('503') || errorMsg.includes('overload')) {
      const throttled = this.policyEngine.recordThrottling(domain, 429);
      RecoveryJournal.logEvent(this.db, item.id, 'DOWNLOAD_FAILED', {
        type: 'SERVER_THROTTLED',
        backoff: throttled.backoffMs,
        newConnections: throttled.newLimit,
      });

      return {
        category: 'SERVER_FAILURE',
        action: 'ADAPTIVE_AIMD_BACKOFF',
        explanation: `Server "${domain}" throttled concurrent requests (HTTP 429/503). Reduced active sockets to ${throttled.newLimit} with ${Math.round(throttled.backoffMs / 1000)}s cooldown.`,
        recommendedActionUser: 'G1DM automatically reduced connection count to respect server rate limits.',
        backoffMs: throttled.backoffMs,
        newConnectionCount: throttled.newLimit,
        retryCount: retryCount + 1,
      };
    }

    // 2. Storage / Disk Failures
    if (errorMsg.includes('enospc') || errorMsg.includes('disk full') || errorMsg.includes('space') || errorMsg.includes('eacces') || errorMsg.includes('permission')) {
      return {
        category: 'STORAGE_FAILURE',
        action: 'PAUSE_AND_EXPLAIN',
        explanation: `Insufficient storage space or write permission denied on target folder: ${item.destinationDir}.`,
        recommendedActionUser: 'Free up disk space on target volume or choose another download location.',
        backoffMs: 0,
        retryCount,
      };
    }

    // 3. Authorization / Session Expiry (401, 403)
    if (errorMsg.includes('401') || errorMsg.includes('403') || errorMsg.includes('forbidden') || errorMsg.includes('unauthorized')) {
      return {
        category: 'RESOURCE_FAILURE',
        action: 'PAUSE_AND_EXPLAIN',
        explanation: `Access denied by server "${domain}" (HTTP 403/401). Temporary download session URL may have expired or requires login credentials.`,
        recommendedActionUser: 'Re-authenticate in your browser or generate a fresh download link.',
        backoffMs: 0,
        retryCount,
      };
    }

    // 4. Resource Missing / Gone (404, 410)
    if (errorMsg.includes('404') || errorMsg.includes('not found') || errorMsg.includes('410') || errorMsg.includes('gone')) {
      return {
        category: 'RESOURCE_FAILURE',
        action: 'ABORT_UNRECOVERABLE',
        explanation: `Remote file was not found on server (HTTP 404/410).`,
        recommendedActionUser: 'Check the URL or search the source site for the updated file link.',
        backoffMs: 0,
        retryCount,
      };
    }

    // 5. Connection Stall / Timeout
    if (errorMsg.includes('stall') || errorMsg.includes('timed out') || errorMsg.includes('timeout') || errorMsg.includes('etimedout')) {
      return {
        category: 'STALL_FAILURE',
        action: 'RESTART_STALLED_SOCKETS',
        explanation: `Connection stalled with 0 KB/s transfer. Transparently restarting stalled sockets while preserving downloaded chunks.`,
        recommendedActionUser: 'G1DM is reconnecting stalled sockets.',
        backoffMs: 2000,
        retryCount: retryCount + 1,
      };
    }

    // 6. Network Disconnection / Connection Reset
    if (errorMsg.includes('econnreset') || errorMsg.includes('socket hang up') || errorMsg.includes('enotfound') || errorMsg.includes('disconnected')) {
      const backoff = Math.min(30000, Math.pow(2, Math.min(retryCount, 5)) * 1000 + Math.random() * 1000);
      return {
        category: 'NETWORK_FAILURE',
        action: 'RETRY_WITH_BACKOFF',
        explanation: `Network connection reset or interrupted. Auto-reconnecting in ${Math.round(backoff / 1000)}s with exponential backoff.`,
        recommendedActionUser: 'Network interrupted. G1DM will automatically resume once connectivity returns.',
        backoffMs: backoff,
        retryCount: retryCount + 1,
      };
    }

    // Default Fallback
    return {
      category: 'UNKNOWN_FAILURE',
      action: 'RETRY_WITH_BACKOFF',
      explanation: `Transfer error: ${error.message}`,
      recommendedActionUser: 'Automatic retry scheduled.',
      backoffMs: 3000,
      retryCount: retryCount + 1,
    };
  }
}
