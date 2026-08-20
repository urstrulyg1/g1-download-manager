import * as fs from 'fs';
import * as path from 'path';
import { AppDatabase } from './Database';
import { DownloadItem } from '../../shared/types';

export interface DoctorIssue {
  id: string;
  category: 'database' | 'filesystem' | 'queue' | 'segment';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  autoFixable: boolean;
  fixAction?: 'relink_default_queue' | 'purge_stale_segments' | 'reset_state_to_failed' | 'delete_broken_sidecar';
  targetId?: string;
}

export interface DoctorReport {
  timestamp: number;
  healthy: boolean;
  issues: DoctorIssue[];
  totalIssues: number;
}

export class DoctorService {
  public static async runDiagnostics(db: AppDatabase): Promise<DoctorReport> {
    const issues: DoctorIssue[] = [];
    const downloads = db.getAllDownloads();
    const queues = db.getQueues();
    const queueIds = new Set(queues.map((q) => q.id));

    // 1. Check Queues Integrity
    for (const item of downloads) {
      if (!queueIds.has(item.queueId)) {
        issues.push({
          id: `queue_orphan_${item.id}`,
          category: 'queue',
          severity: 'medium',
          title: `Download references non-existent queue: "${item.queueId}"`,
          description: `Download [${item.filename}] is assigned to a missing queue ID.`,
          autoFixable: true,
          fixAction: 'relink_default_queue',
          targetId: item.id,
        });
      }
    }

    // 2. Check File System & Sidecars
    for (const item of downloads) {
      if (item.status === 'completed' && !fs.existsSync(item.finalPath)) {
        issues.push({
          id: `missing_final_${item.id}`,
          category: 'filesystem',
          severity: 'low',
          title: `Completed file missing from disk: "${item.filename}"`,
          description: `Target path does not exist: ${item.finalPath}`,
          autoFixable: false,
          targetId: item.id,
        });
      }

      if (item.status === 'downloading' || item.status === 'paused') {
        // Check if sidecar is valid JSON
        if (fs.existsSync(item.stateFilePath)) {
          try {
            const raw = fs.readFileSync(item.stateFilePath, 'utf8');
            JSON.parse(raw);
          } catch {
            issues.push({
              id: `corrupt_sidecar_${item.id}`,
              category: 'filesystem',
              severity: 'high',
              title: `Corrupt sidecar metadata: "${item.stateFilePath}"`,
              description: 'Sidecar metadata file contains invalid JSON data.',
              autoFixable: true,
              fixAction: 'delete_broken_sidecar',
              targetId: item.id,
            });
          }
        }
      }
    }

    return {
      timestamp: Date.now(),
      healthy: issues.length === 0,
      issues,
      totalIssues: issues.length,
    };
  }

  public static async autoRepair(db: AppDatabase, issueIds: string[]): Promise<{ repairedCount: number }> {
    const report = await this.runDiagnostics(db);
    const toFix = report.issues.filter((iss) => issueIds.includes(iss.id) && iss.autoFixable);

    let count = 0;
    for (const issue of toFix) {
      if (issue.fixAction === 'relink_default_queue' && issue.targetId) {
        const item = db.getDownload(issue.targetId);
        if (item) {
          item.queueId = 'default';
          db.saveDownload(item);
          count++;
        }
      } else if (issue.fixAction === 'delete_broken_sidecar' && issue.targetId) {
        const item = db.getDownload(issue.targetId);
        if (item && fs.existsSync(item.stateFilePath)) {
          try {
            fs.unlinkSync(item.stateFilePath);
            count++;
          } catch {}
        }
      }
    }

    db.flush();
    return { repairedCount: count };
  }
}
