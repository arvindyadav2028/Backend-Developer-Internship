import { Router, Request, Response } from 'express';
import { TaskService } from '../services/taskService';
import { Database } from '../db/database';

export function createTaskRouter(db: Database): Router {
  const router = Router();
  const taskService = new TaskService(db);

  // Get all tasks
  router.get('/', async (_: Request, res: Response) => {
    try {
      const tasks = await taskService.getAllTasks();
      return res.json(tasks);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Internal error' });
    }
  });

  // Get specific task
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const task = await taskService.getTaskById(req.params.id);
      if (!task) return res.status(404).json({ error: 'Not found' });
      return res.json(task);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Internal error' });
    }
  });

  // Create task
  router.post('/', async (req: Request, res: Response) => {
    try {
      const payload = req.body;
      if (!payload || !payload.title) return res.status(400).json({ error: 'title is required' });
      const task = await taskService.createTask(payload);
      return res.status(201).json(task);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Internal error' });
    }
  });

  // Update task
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const updated = await taskService.updateTask(req.params.id, req.body);
      return res.json(updated);
    } catch (err: any) {
      if (err.message === 'Task not found') return res.status(404).json({ error: 'Not found' });
      return res.status(500).json({ error: err.message || 'Internal error' });
    }
  });

  // Delete task
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      await taskService.deleteTask(req.params.id);
      return res.status(204).send();
    } catch (err: any) {
      if (err.message === 'Task not found') return res.status(404).json({ error: 'Not found' });
      return res.status(500).json({ error: err.message || 'Internal error' });
    }
  });

  return router;
}
