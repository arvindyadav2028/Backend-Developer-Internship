import axios from 'axios';
import { BatchSyncRequest, BatchSyncResponse } from '../types';
import { Database } from '../db/database';

export class SyncService {
  private apiUrl: string;
  private batchSize: number;

  constructor(
    private db: Database,
    apiUrl: string = process.env.API_BASE_URL || 'http://localhost:3000/api'
  ) {
    this.apiUrl = apiUrl;
    this.batchSize = Number(process.env.SYNC_BATCH_SIZE || 50);
  }

  async processSyncQueue(): Promise<{ processed: number; errors: number }> {
    const queueItems: any[] = await this.db.all(
      `SELECT * FROM sync_queue ORDER BY created_at ASC LIMIT ?`,
      [this.batchSize]
    );
    if (!queueItems || queueItems.length === 0) return { processed: 0, errors: 0 };

    const request: BatchSyncRequest = {
      items: queueItems.map((q) => ({
        id: q.id,
        task_id: q.task_id,
        operation: q.operation,
        task_data: JSON.parse(q.data), // 👈 matches DB schema
        retry_count: q.retry_count,
        created_at: new Date(q.created_at),
      })),
    } as any;

    try {
      const resp = await axios.post(`${this.apiUrl}/sync/batch`, request, { timeout: 15000 });
      const data: BatchSyncResponse = resp.data;

      let processed = 0;
      let errors = 0;
      for (const item of data.processed_items) {
        if (item.status === 'success') {
          await this.db.run(
            `UPDATE tasks SET sync_status = 'synced', server_id = ?, last_synced_at = ? WHERE id = ?`,
            [item.server_id || item.resolved_data?.id || null, new Date().toISOString(), item.client_id]
          );
          await this.db.run(`DELETE FROM sync_queue WHERE id = ?`, [item.client_id]);
          processed++;
        } else if (item.status === 'conflict') {
          if (item.resolved_data) {
            const t = item.resolved_data;
            await this.db.run(
              `UPDATE tasks SET title = ?, description = ?, completed = ?, updated_at = ?, sync_status = 'synced', server_id = ?, last_synced_at = ? WHERE id = ?`,
              [
                t.title,
                t.description,
                t.completed ? 1 : 0,
                new Date(t.updated_at).toISOString(),
                t.server_id || null,
                new Date().toISOString(),
                t.id,
              ]
            );
            await this.db.run(`DELETE FROM sync_queue WHERE id = ?`, [item.client_id]);
            processed++;
          } else {
            errors++;
          }
        } else {
          errors++;
          await this.db.run(`UPDATE sync_queue SET retry_count = retry_count + 1 WHERE id = ?`, [item.client_id]);
          const qrow: any = await this.db.get(`SELECT retry_count, task_id FROM sync_queue WHERE id = ?`, [item.client_id]);
          if (qrow && qrow.retry_count >= 3) {
            await this.db.run(`UPDATE tasks SET sync_status = 'error' WHERE id = ?`, [qrow.task_id]);
          }
        }
      }

      return { processed, errors };
    } catch (err) {
      for (const q of queueItems) {
        await this.db.run(`UPDATE sync_queue SET retry_count = retry_count + 1 WHERE id = ?`, [q.id]);
        const qrow: any = await this.db.get(`SELECT retry_count, task_id FROM sync_queue WHERE id = ?`, [q.id]);
        if (qrow && qrow.retry_count >= 3) {
          await this.db.run(`UPDATE tasks SET sync_status = 'error' WHERE id = ?`, [qrow.task_id]);
        }
      }
      throw err;
    }
  }

  async checkConnectivity(): Promise<boolean> {
    try {
      await axios.get(`${this.apiUrl}/sync/health`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}
