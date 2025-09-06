import { v4 as uuidv4 } from 'uuid';
import { Task } from '../types';
import { Database } from '../db/database';

export class TaskService {
  constructor(private db: Database) {}

  private nowISO(): string {
    return new Date().toISOString();
  }

  async createTask(taskData: Partial<Task>): Promise<Task> {
    const id = uuidv4();
    const serverId = `srv-${id}`;
    const now = this.nowISO();
    if (!taskData.title) {
      throw new Error('Title is required');
    }

    const task: Task = {
      id,
      title: taskData.title,
      description: taskData.description || null,
      completed: taskData.completed ?? false,
      created_at: new Date(now),
      updated_at: new Date(now),
      is_deleted: false,
      sync_status: 'pending',
      server_id: serverId,
      last_synced_at: now,
    } as any;

    const insertSql = `
      INSERT INTO tasks (id, title, description, completed, created_at, updated_at, is_deleted, sync_status, server_id, last_synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.run(insertSql, [
      task.id,
      task.title,
      task.description,
      task.completed ? 1 : 0,
      task.created_at.toISOString(),
      task.updated_at.toISOString(),
      task.is_deleted ? 1 : 0,
      task.sync_status,
      task.server_id,
      task.last_synced_at ? task.last_synced_at : null,
    ]);

    // Add to sync queue
    const queueSql = `
      INSERT INTO sync_queue (id, task_id, operation, data, retry_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const queueId = uuidv4();
    await this.db.run(queueSql, [
      queueId,
      task.id,
      'create',
      JSON.stringify(task),
      0,
      now,
    ]);

    return task;
  }

  async getTaskById(id: string): Promise<Task | null> {
    const row: any = await this.db.get(`SELECT * FROM tasks WHERE id = ?`, [id]);
    if (!row) return null;
    return this.rowToTask(row);
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const existing = await this.getTaskById(id);
    if (!existing) throw new Error('Task not found');

    const now = this.nowISO();
    const updated: any = {
      ...existing,
      title: updates.title ?? existing.title,
      description: updates.description ?? existing.description,
      completed: updates.completed ?? existing.completed,
      updated_at: new Date(now),
      sync_status: 'pending',
    };

    const updateSql = `
      UPDATE tasks SET title = ?, description = ?, completed = ?, updated_at = ?, sync_status = ? WHERE id = ?
    `;
    await this.db.run(updateSql, [
      updated.title,
      updated.description,
      updated.completed ? 1 : 0,
      updated.updated_at.toISOString(),
      updated.sync_status,
      id,
    ]);

    // Add to sync queue
    const queueSql = `
      INSERT INTO sync_queue (id, task_id, operation, data, retry_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const queueId = uuidv4();
    await this.db.run(queueSql, [
      queueId,
      id,
      'update',
      JSON.stringify(updated),
      0,
      now,
    ]);

    return this.rowToTask({ ...updated, id });
  }

  async deleteTask(id: string): Promise<void> {
    const existing = await this.getTaskById(id);
    if (!existing) throw new Error('Task not found');

    const now = this.nowISO();
    const delSql = `UPDATE tasks SET is_deleted = 1, updated_at = ?, sync_status = ? WHERE id = ?`;
    await this.db.run(delSql, [now, 'pending', id]);

    const queueSql = `
      INSERT INTO sync_queue (id, task_id, operation, data, retry_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const queueId = uuidv4();
    await this.db.run(queueSql, [
      queueId,
      id,
      'delete',
      JSON.stringify({ id }),
      0,
      now,
    ]);

    return;
  }

  async getAllTasks(): Promise<Task[]> {
    const rows: any[] = await this.db.all(
      `SELECT * FROM tasks WHERE is_deleted = 0 ORDER BY updated_at DESC`
    );
    return rows.map((r) => this.rowToTask(r));
  }

  async getTasksNeedingSync(): Promise<Task[]> {
    const rows: any[] = await this.db.all(
      `SELECT * FROM tasks WHERE sync_status IN ('pending','error')`
    );
    return rows.map((r) => this.rowToTask(r));
  }

  private rowToTask(row: any): Task {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      completed: !!row.completed,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      is_deleted: !!row.is_deleted,
      sync_status: row.sync_status,
      server_id: row.server_id,
      last_synced_at: row.last_synced_at ? new Date(row.last_synced_at) : null,
    } as Task;
  }
}
