import { Router } from 'express';
import { DownloadEngine } from '../engine/DownloadEngine';
import { AppDatabase } from '../db/Database';

export function createApiV1Router(engine: DownloadEngine, db: AppDatabase): Router {
  const router = Router();

  // OpenAPI Specification JSON
  router.get('/openapi.json', (req, res) => {
    res.json({
      openapi: '3.0.3',
      info: {
        title: 'G1DM — Next-Generation Internet Download Manager API',
        version: '1.0.0',
        description: 'High-performance, observable, and autonomous download management REST API.',
      },
      paths: {
        '/api/v1/downloads': {
          get: { summary: 'List all managed downloads' },
          post: { summary: 'Enqueue a new download' },
        },
        '/api/v1/downloads/{id}': {
          get: { summary: 'Get detailed download status and segment telemetry' },
          delete: { summary: 'Remove a download' },
        },
        '/api/v1/queues': {
          get: { summary: 'List download queues and concurrency settings' },
        },
        '/api/v1/network/quality': {
          get: { summary: 'Measure live RTT, jitter, and bandwidth budget' },
        },
        '/api/v1/storage/pools': {
          get: { summary: 'Inspect multi-drive storage pools' },
        },
      },
    });
  });

  // Downloads v1
  router.get('/downloads', (req, res) => {
    res.json(engine.getAllDownloads());
  });

  router.post('/downloads', async (req, res) => {
    try {
      if (!req.body || typeof req.body.url !== 'string' || !req.body.url.trim()) {
        return res.status(400).json({ error: 'url is required' });
      }
      const item = await engine.addDownload(req.body);
      res.json(item);
    } catch (err: any) {
      // Distinguish user-input errors (4xx) from unexpected server errors (5xx)
      const msg: string = err.message || String(err);
      const isClientError =
        msg.toLowerCase().includes('invalid url') ||
        msg.toLowerCase().includes('outside the permitted') ||
        msg.toLowerCase().includes('skipped') ||
        msg.toLowerCase().includes('already exists') ||
        msg.toLowerCase().includes('outside the configured download directory');
      res.status(isClientError ? 400 : 500).json({ error: msg });
    }
  });

  router.get('/downloads/:id', (req, res) => {
    const item = engine.getDownload(req.params.id);
    if (!item) return res.status(404).json({ error: 'Download not found' });
    res.json(item);
  });

  router.post('/downloads/:id/pause', (req, res) => {
    engine.pauseDownload(req.params.id);
    res.json({ success: true });
  });

  router.post('/downloads/:id/resume', (req, res) => {
    engine.resumeDownload(req.params.id);
    res.json({ success: true });
  });

  router.delete('/downloads/:id', (req, res) => {
    const deleteFile = req.query.deleteFile === 'true' || req.query.deleteFile === '1' || (req.body && req.body.deleteFile === true);
    engine.deleteDownload(req.params.id, deleteFile);
    res.json({ success: true });
  });

  // Queues v1
  router.get('/queues', (req, res) => {
    res.json(db.getQueues());
  });

  return router;
}
