import { Router, Response } from 'express';
import { SyncService } from '../services/syncService';
import { TaskService } from '../services/taskService';
import { Database } from '../db/database';

export function createSyncRouter(db: Database): Router {
  const router = Router();
  const taskService = new TaskService(db);
  const syncService = new SyncService(db);

  // Trigger manual sync
  router.post('/sync', async (_: any, res: Response) => {
    try {
      const result = await syncService.processSyncQueue();
      return res.json({ ok: true, result });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Sync failed' });
    }
  });

  // Status - number of pending items
  router.get('/status', async (_: any, res: Response) => {
    try {
      const rows: any[] = await db.all(`SELECT COUNT(*) as cnt FROM sync_queue`);
      return res.json({ pending: rows[0]?.cnt ?? 0 });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Internal error' });
    }
  });

  // Batch sync endpoint (for server-side)
  router.post('/batch', async (req: any, res: Response) => {
    try {
      const items = req.body.items || [];
      const processed = items.map((it: any) => ({
        client_id: it.id,
        server_id: it.task_data?.server_id || `srv-${it.task_id}`,
        status: 'success',
        resolved_data: it.task_data,
      }));
      return res.json({ processed_items: processed });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Internal error' });
    }
  });

  // Health check endpoint
  router.get('/health', async (_: any, res: Response) => {
    console.log("Health endpoint hit ✅");
    return res.json({ status: 'ok', timestamp: new Date() });
  });

  return router;
}
