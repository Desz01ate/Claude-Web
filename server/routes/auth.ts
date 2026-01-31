import { Router, Express } from 'express';
import type { AuthService } from '../services/AuthService';

export function setupAuthRoutes(app: Express, authService: AuthService): void {
  const router = Router();

  /**
   * GET /api/auth/status
   * Get authentication status (enabled/disabled)
   */
  router.get('/auth/status', (req, res) => {
    try {
      const enabled = authService.isAuthEnabled();
      res.json({ enabled });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: errorMsg });
    }
  });

  /**
   * POST /api/auth/login
   * Authenticate with password and receive a token
   */
  router.post('/auth/login', async (req, res) => {
    try {
      const { password } = req.body;

      // Validate request body
      if (typeof password !== 'string' || password.length === 0) {
        res.status(400).json({ error: 'Password is required' });
        return;
      }

      // Password should be reasonable length
      if (password.length > 1024) {
        res.status(400).json({ error: 'Password too long' });
        return;
      }

      const result = await authService.login(password);

      if (!result.success) {
        res.status(401).json({ error: result.error });
        return;
      }

      res.json({ token: result.token });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: errorMsg });
    }
  });

  app.use('/api', router);
}
