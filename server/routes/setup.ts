import { Router, Express } from 'express';
import { HookInstaller } from '../services/HookInstaller';

export function setupSetupRoutes(app: Express): void {
  const router = Router();
  const installer = new HookInstaller();

  // Get installation status
  router.get('/setup/status', async (req, res) => {
    try {
      const status = await installer.checkStatus();
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Install hooks
  router.post('/setup/install', async (req, res) => {
    try {
      const status = await installer.install();
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Uninstall hooks
  router.post('/setup/uninstall', async (req, res) => {
    try {
      const status = await installer.uninstall();
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.use('/api', router);
}
