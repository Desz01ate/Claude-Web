import { Router, Express } from 'express';
import type { ConfigStore } from '../services/ConfigStore';

export function setupConfigRoutes(app: Express, configStore: ConfigStore): void {
  const router = Router();

  /**
   * GET /api/config
   * Get current app configuration
   */
  router.get('/config', (req, res) => {
    try {
      const config = configStore.getConfig();
      res.json(config);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: errorMsg });
    }
  });

  /**
   * PUT /api/config
   * Update app configuration
   */
  router.put('/config', (req, res) => {
    try {
      const updates = req.body;

      // Validate that body contains expected fields
      if (typeof updates !== 'object' || updates === null) {
        res.status(400).json({ error: 'Invalid request body' });
        return;
      }

      const config = configStore.updateConfig(updates);
      res.json(config);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: errorMsg });
    }
  });

  app.use('/api', router);
}
