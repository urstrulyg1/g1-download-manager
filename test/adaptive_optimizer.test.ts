import { AdaptiveOptimizer } from '../src/main/intelligence/AdaptiveOptimizer';

describe('Self-Optimizing Adaptive Optimizer', () => {
  it('should scale socket allocation when high throughput is detected', () => {
    const optimizer = new AdaptiveOptimizer();
    const mockItem: any = {
      id: 'dl_opt_1',
      maxConnections: 8,
      serverCapabilities: { supportsRange: true },
    };

    const opt = optimizer.optimize(mockItem, 25 * 1024 * 1024); // 25 MB/s
    expect(opt).not.toBeNull();
    expect(opt?.optimizationType).toBe('SOCKET_SCALING');
    expect(mockItem.maxConnections).toBe(10);
    expect(optimizer.getHistory('dl_opt_1').length).toBe(1);
  });

  it('should consolidate sockets when server rate is slow', () => {
    const optimizer = new AdaptiveOptimizer();
    const mockItem: any = {
      id: 'dl_opt_2',
      maxConnections: 8,
      serverCapabilities: { supportsRange: true },
    };

    const opt = optimizer.optimize(mockItem, 500 * 1024); // 500 KB/s
    expect(opt).not.toBeNull();
    expect(mockItem.maxConnections).toBe(4);
  });
});
