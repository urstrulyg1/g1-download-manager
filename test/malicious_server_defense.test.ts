import * as http from 'http';
import { ProbeService } from '../src/main/engine/ProbeService';

describe('Malicious Server & Attack Vector Defense Suite', () => {
  let server: http.Server;
  let serverPort: number;

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      // 1. Infinite redirect trap loop
      if (req.url === '/infinite-1') {
        res.writeHead(302, { Location: '/infinite-2' });
        res.end();
        return;
      }
      if (req.url === '/infinite-2') {
        res.writeHead(302, { Location: '/infinite-1' });
        res.end();
        return;
      }

      // 2. Malformed Content-Range header
      if (req.url === '/malformed-range') {
        res.writeHead(200, { 'Content-Range': 'invalid bytes syntax' });
        res.end('payload');
        return;
      }

      res.writeHead(200);
      res.end('ok');
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

  it('should break out of infinite redirect loops within configured maximum hops', async () => {
    const probe = await ProbeService.probe(`http://127.0.0.1:${serverPort}/infinite-1`, undefined, undefined, 4000);
    expect(probe.capabilities.redirectChain.length).toBeLessThanOrEqual(12);
  });

  it('should handle malformed Content-Range safely as unknown stream', async () => {
    const probe = await ProbeService.probe(`http://127.0.0.1:${serverPort}/malformed-range`);
    expect(probe.size).toBe(-1);
  });
});
