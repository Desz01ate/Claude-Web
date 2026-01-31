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
  router.put('/config', async (req, res) => {
    try {
      const updates = req.body;

      // Validate that body contains expected fields
      if (typeof updates !== 'object' || updates === null) {
        res.status(400).json({ error: 'Invalid request body' });
        return;
      }

      // Handle password set/remove operations
      if (updates.setPassword !== undefined) {
        const password = updates.setPassword;
        if (typeof password !== 'string' || password.length < 6) {
          res.status(400).json({ error: 'Password must be at least 6 characters' });
          return;
        }
        if (password.length > 1024) {
          res.status(400).json({ error: 'Password too long' });
          return;
        }
        await configStore.setPassword(password);
        // Return updated config (excluding the hash)
        const config = configStore.getConfig();
        const { passwordHash, ...configWithoutHash } = config;
        res.json(configWithoutHash);
        return;
      }

      if (updates.removePassword !== undefined && updates.removePassword === true) {
        configStore.removePassword();
        const config = configStore.getConfig();
        const { passwordHash, ...configWithoutHash } = config;
        res.json(configWithoutHash);
        return;
      }

      // Regular config updates (exclude passwordHash from response)
      const config = configStore.updateConfig(updates);
      const { passwordHash, ...configWithoutHash } = config;
      res.json(configWithoutHash);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: errorMsg });
    }
  });

  app.use('/api', router);
}
