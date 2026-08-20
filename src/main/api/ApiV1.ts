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
      const item = await engine.addDownload(req.body);
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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
    const deleteFile = req.query.deleteFile === 'true';
    engine.deleteDownload(req.params.id, deleteFile);
    res.json({ success: true });
  });

  // Queues v1
  router.get('/queues', (req, res) => {
    res.json(db.getQueues());
  });

  return router;
}
