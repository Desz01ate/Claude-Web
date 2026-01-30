import { Router, Express } from 'express';
import type { SessionStore } from '../services/SessionStore';

export function setupRoutes(app: Express, sessionStore: SessionStore): void {
  const router = Router();

  // Get all active sessions
  router.get('/sessions', (req, res) => {
    const sessions = sessionStore.getAllSessions();
    res.json(sessions);
  });

  // Get specific session
  router.get('/sessions/:id', (req, res) => {
    const session = sessionStore.getSession(req.params.id);
    if (session) {
      res.json(session);
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  });

  app.use('/api', router);
}
