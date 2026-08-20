import { EventEmitter } from 'events';

export interface InboxItem {
  id: string;
  url: string;
  source: 'browser' | 'clipboard' | 'drag_drop' | 'cli' | 'media_detector' | 'link_extractor';
  suggestedFilename: string;
  suggestedCategory: string;
  size?: number;
  mimeType?: string;
  capturedAt: number;
  selected: boolean;
}

export class DownloadInbox extends EventEmitter {
  private items: Map<string, InboxItem> = new Map();

  public addItem(item: Omit<InboxItem, 'id' | 'capturedAt' | 'selected'>): InboxItem {
    const id = `inbox_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fullItem: InboxItem = {
      ...item,
      id,
      capturedAt: Date.now(),
      selected: true,
    };

    this.items.set(id, fullItem);
    this.emit('item_added', fullItem);
    return fullItem;
  }

  public getItems(): InboxItem[] {
    return Array.from(this.items.values()).sort((a, b) => b.capturedAt - a.capturedAt);
  }

  public removeItem(id: string): void {
    this.items.delete(id);
    this.emit('item_removed', id);
  }

  public clear(): void {
    this.items.clear();
    this.emit('cleared');
  }
}
