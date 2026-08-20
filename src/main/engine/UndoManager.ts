import { EventEmitter } from 'events';
import { DownloadItem } from '../../shared/types';
import { AppDatabase } from '../db/Database';

export interface UndoableAction {
  id: string;
  type: 'DELETE_DOWNLOAD' | 'REMOVE_FROM_QUEUE' | 'CHANGE_CATEGORY' | 'CHANGE_PRIORITY' | 'BULK_DELETE';
  description: string;
  items: DownloadItem[];
  timestamp: number;
}

export class UndoManager extends EventEmitter {
  private undoStack: UndoableAction[] = [];
  private db: AppDatabase;

  constructor(db: AppDatabase) {
    super();
    this.db = db;
  }

  public recordAction(action: Omit<UndoableAction, 'id' | 'timestamp'>): UndoableAction {
    const fullAction: UndoableAction = {
      ...action,
      id: `undo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
    };

    this.undoStack.push(fullAction);
    if (this.undoStack.length > 20) this.undoStack.shift();

    this.emit('action_recorded', fullAction);
    return fullAction;
  }

  public async undoLastAction(): Promise<{ success: boolean; restoredCount: number; message: string }> {
    const action = this.undoStack.pop();
    if (!action) {
      return { success: false, restoredCount: 0, message: 'No actions to undo.' };
    }

    let restored = 0;
    for (const item of action.items) {
      this.db.saveDownload(item);
      restored++;
    }

    this.db.flush();
    this.emit('action_undone', action);

    return {
      success: true,
      restoredCount: restored,
      message: `Undone action: ${action.description} (Restored ${restored} download items).`,
    };
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public getUndoStack(): UndoableAction[] {
    return [...this.undoStack];
  }
}
