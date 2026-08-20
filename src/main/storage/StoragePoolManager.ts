import * as fs from 'fs';
import * as path from 'path';
import { StorageManager } from './StorageManager';

export interface StoragePool {
  id: string;
  name: string;
  mountPath: string;
  type: 'SSD' | 'HDD' | 'EXTERNAL_DRIVE' | 'NETWORK_SHARE';
  isAvailable: boolean;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  writeThroughputMbps: number;
}

export type StorageAllocationPolicy =
  | 'FASTEST_DRIVE_FOR_TEMP'
  | 'MOST_FREE_SPACE'
  | 'CATEGORY_AFFINITY'
  | 'DEFAULT_FOLDER';

export class StoragePoolManager {
  private pools: Map<string, StoragePool> = new Map();

  constructor(initialPaths: string[] = ['/home/user/Downloads']) {
    for (const p of initialPaths) {
      this.registerPool(p, path.basename(p) || 'Default Storage', 'SSD');
    }
  }

  public registerPool(mountPath: string, name: string, type: StoragePool['type'] = 'SSD'): StoragePool {
    const stats = StorageManager.getStorageStats(mountPath);
    const id = `pool_${Buffer.from(mountPath).toString('base64').replace(/[/+=]/g, '').slice(0, 8)}`;
    const pool: StoragePool = {
      id,
      name,
      mountPath,
      type,
      isAvailable: fs.existsSync(mountPath),
      totalBytes: stats.totalBytes,
      freeBytes: stats.freeBytes,
      usedBytes: stats.usedBytes,
      writeThroughputMbps: type === 'SSD' ? 450 : 120,
    };

    this.pools.set(id, pool);
    return pool;
  }

  public selectDestinationPool(policy: StorageAllocationPolicy = 'DEFAULT_FOLDER', category?: string): StoragePool {
    const availablePools = Array.from(this.pools.values()).filter((p) => p.isAvailable);
    if (availablePools.length === 0) {
      return this.registerPool('/home/user/Downloads', 'Default Downloads', 'SSD');
    }

    if (policy === 'MOST_FREE_SPACE') {
      return availablePools.sort((a, b) => b.freeBytes - a.freeBytes)[0];
    }

    if (policy === 'FASTEST_DRIVE_FOR_TEMP') {
      const ssd = availablePools.find((p) => p.type === 'SSD');
      if (ssd) return ssd;
    }

    return availablePools[0];
  }

  public getAllPools(): StoragePool[] {
    // Refresh stats
    for (const pool of this.pools.values()) {
      pool.isAvailable = fs.existsSync(pool.mountPath);
      if (pool.isAvailable) {
        const stats = StorageManager.getStorageStats(pool.mountPath);
        pool.totalBytes = stats.totalBytes;
        pool.freeBytes = stats.freeBytes;
        pool.usedBytes = stats.usedBytes;
      }
    }
    return Array.from(this.pools.values());
  }
}
