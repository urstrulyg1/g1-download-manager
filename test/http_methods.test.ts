import * as http from 'http';
import { ProbeService } from '../src/main/engine/ProbeService';

describe('HTTP Protocol Edge Cases & Methods', () => {
  let server: http.Server;
  let serverPort: number;

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      if (req.url === '/range-416') {
        res.writeHead(416, { 'Content-Range': 'bytes */1000' });
        res.end();
        return;
      }
      if (req.url === '/empty-file.bin') {
        res.writeHead(200, { 'Content-Length': 0, 'Content-Type': 'application/octet-stream' });
        res.end();
        return;
      }
      if (req.url === '/custom-header-auth') {
        const customToken = req.headers['x-custom-auth'];
        if (customToken === 'secret-token-123') {
          res.writeHead(200, { 'Content-Length': 20, 'Content-Type': 'text/plain' });
          res.end('Authenticated payload');
        } else {
          res.writeHead(403);
          res.end('Forbidden');
        }
        return;
      }
      res.writeHead(200, { 'Content-Length': 10 });
      res.end('0123456789');
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

  it('should support custom authentication headers in probe and requests', async () => {
    const probe = await ProbeService.probe(`http://127.0.0.1:${serverPort}/custom-header-auth`, {
      customHeaders: { 'x-custom-auth': 'secret-token-123' },
    });
    expect(probe.capabilities.httpStatus).toBe(200);
    expect(probe.size).toBe(20);
  });

  it('should handle zero-byte empty remote files safely', async () => {
    const probe = await ProbeService.probe(`http://127.0.0.1:${serverPort}/empty-file.bin`);
    expect(probe.size).toBe(-1);
  });
});
