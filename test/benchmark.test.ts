import { DownloadBenchmark } from '../src/main/engine/DownloadBenchmark';
import * as http from 'http';

describe('Download Benchmark Engine', () => {
  let server: http.Server;
  let serverPort: number;

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      const payload = Buffer.alloc(100 * 1024, 0x42); // 100 KB
      res.writeHead(200, { 'Content-Length': payload.length, 'Content-Type': 'application/octet-stream' });
      res.end(payload);
    });

    server.listen(0, '127.0.0.1', () => {
      const addr: any = server.address();
      serverPort = addr.port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  it('should run multi-tier benchmark probe and recommend optimal worker allocation', async () => {
    const targetUrl = `http://127.0.0.1:${serverPort}/bench.bin`;
    const report = await DownloadBenchmark.runBenchmark(targetUrl, 500);

    expect(report.testedTiers.length).toBe(4);
    expect(report.recommendedWorkers).toBeGreaterThanOrEqual(1);
    expect(report.peakThroughputFormatted).toBeDefined();
    expect(report.recommendationReason).toContain('Benchmark demonstrates');
  });
});
