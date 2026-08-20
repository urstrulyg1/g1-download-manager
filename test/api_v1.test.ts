import { createApiV1Router } from '../src/main/api/ApiV1';
import { AppDatabase } from '../src/main/db/Database';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';
import express from 'express';
import request from 'http';
import * as path from 'path';
import * as fs from 'fs';

describe('Versioned Local API v1 & OpenAPI Specification Suite', () => {
  const testDir = path.join(__dirname, 'tmp_api_v1_test');
  let server: any;
  let serverPort: number;

  beforeAll((done) => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    const db = new AppDatabase(path.join(testDir, 'api_v1.db'));
    db.init().then(() => {
      const engine = new DownloadEngine(db);
      engine.init().then(() => {
        const app = express();
        app.use(express.json());
        app.use('/api/v1', createApiV1Router(engine, db));

        server = app.listen(0, '127.0.0.1', () => {
          serverPort = server.address().port;
          done();
        });
      });
    });
  });

  afterAll((done) => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    if (server) {
      server.close(done);
    } else {
      done();
    }
  });

  it('should serve interactive OpenAPI 3.0 JSON specification', async () => {
    const data = await new Promise<string>((resolve) => {
      request.get(`http://127.0.0.1:${serverPort}/api/v1/openapi.json`, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve(body));
      });
    });

    const json = JSON.parse(data);
    expect(json.openapi).toBe('3.0.3');
    expect(json.info.title).toContain('G1DM');
  });

  it('should list downloads over /api/v1/downloads', async () => {
    const data = await new Promise<string>((resolve) => {
      request.get(`http://127.0.0.1:${serverPort}/api/v1/downloads`, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve(body));
      });
    });

    const list = JSON.parse(data);
    expect(Array.isArray(list)).toBe(true);
  });
});
