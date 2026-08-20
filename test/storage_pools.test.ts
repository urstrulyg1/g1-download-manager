import { StoragePoolManager } from '../src/main/storage/StoragePoolManager';

describe('Storage Pool & Multi-Destination Manager', () => {
  it('should register storage pools and select destinations by allocation policy', () => {
    const mgr = new StoragePoolManager(['/home/user/Downloads']);
    const pools = mgr.getAllPools();

    expect(pools.length).toBeGreaterThanOrEqual(1);
    expect(pools[0].type).toBe('SSD');

    const chosen = mgr.selectDestinationPool('FASTEST_DRIVE_FOR_TEMP');
    expect(chosen).toBeDefined();
    expect(chosen.type).toBe('SSD');
  });
});
