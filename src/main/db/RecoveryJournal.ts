import { AppDatabase } from './Database';

export type JournalEventType =
  | 'DOWNLOAD_CREATED'
  | 'SEGMENT_ASSIGNED'
  | 'SEGMENT_PROGRESS'
  | 'SEGMENT_COMPLETED'
  | 'DOWNLOAD_PAUSED'
  | 'DOWNLOAD_RESUMED'
  | 'DOWNLOAD_FAILED'
  | 'DOWNLOAD_COMPLETED'
  | 'WORK_STOLEN';

export interface RecoveryJournalEntry {
  id: string;
  downloadId: string;
  eventType: JournalEventType;
  payloadJson: string;
  timestamp: number;
}

export class RecoveryJournal {
  public static logEvent(
    db: AppDatabase,
    downloadId: string,
    eventType: JournalEventType,
    payload: any = {}
  ): void {
    const entry: RecoveryJournalEntry = {
      id: `j_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      downloadId,
      eventType,
      payloadJson: JSON.stringify(payload),
      timestamp: Date.now(),
    };

    // Stored in the DB memory/disk transaction journal
    try {
      (db as any).db?.run(
        `
        CREATE TABLE IF NOT EXISTS recovery_journal (
          id TEXT PRIMARY KEY,
          downloadId TEXT NOT NULL,
          eventType TEXT NOT NULL,
          payloadJson TEXT NOT NULL,
          timestamp INTEGER NOT NULL
        );
      `
      );

      (db as any).db?.run(
        `
        INSERT INTO recovery_journal (id, downloadId, eventType, payloadJson, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `,
        [entry.id, entry.downloadId, entry.eventType, entry.payloadJson, entry.timestamp]
      );
    } catch {
      // ignore
    }
  }

  public static getEventsForDownload(db: AppDatabase, downloadId: string): RecoveryJournalEntry[] {
    try {
      const res = (db as any).db?.exec(
        'SELECT * FROM recovery_journal WHERE downloadId = ? ORDER BY timestamp ASC',
        [downloadId]
      );
      if (!res || res.length === 0) return [];
      const cols = res[0].columns;
      return res[0].values.map((v: any) => {
        const row: any = {};
        cols.forEach((c: string, i: number) => (row[c] = v[i]));
        return row;
      });
    } catch {
      return [];
    }
  }
}
