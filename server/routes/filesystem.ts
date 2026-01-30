import { Router, Express } from 'express';
import * as fs from 'fs';
import * as path from 'path';

export function setupFilesystemRoutes(app: Express): void {
  const router = Router();

  /**
   * GET /api/filesystem/autocomplete
   * Returns matching directories for the given path input
   */
  router.get('/filesystem/autocomplete', async (req, res) => {
    try {
      const inputPath = req.query.path as string;

      if (!inputPath) {
        // Return home directory as default
        const homeDir = process.env.HOME || '/';
        res.json({ suggestions: [homeDir] });
        return;
      }

      // Expand ~ to home directory
      let expandedPath = inputPath;
      if (inputPath.startsWith('~')) {
        const homeDir = process.env.HOME || '/';
        expandedPath = inputPath.replace(/^~/, homeDir);
      }

      // Get the directory to search and the partial name to match
      let searchDir: string;
      let prefix: string;

      if (expandedPath.endsWith('/')) {
        // User is looking for contents of this directory
        searchDir = expandedPath;
        prefix = '';
      } else {
        // User might be typing a partial name
        searchDir = path.dirname(expandedPath);
        prefix = path.basename(expandedPath).toLowerCase();
      }

      // Validate and read directory
      if (!fs.existsSync(searchDir)) {
        res.json({ suggestions: [], error: 'Directory does not exist' });
        return;
      }

      const stats = fs.statSync(searchDir);
      if (!stats.isDirectory()) {
        res.json({ suggestions: [], error: 'Not a directory' });
        return;
      }

      // Read directory entries
      const entries = await fs.promises.readdir(searchDir, { withFileTypes: true });

      // Filter to directories only and match prefix
      const suggestions: string[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.') && !prefix.startsWith('.')) continue; // Hide hidden dirs unless explicitly requested
        if (prefix && !entry.name.toLowerCase().startsWith(prefix)) continue;

        // Build full path
        let fullPath = path.join(searchDir, entry.name);
        // Add trailing slash to indicate it's a directory
        if (!fullPath.endsWith('/')) {
          fullPath += '/';
        }

        suggestions.push(fullPath);

        // Limit results
        if (suggestions.length >= 20) break;
      }

      // Sort alphabetically
      suggestions.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

      res.json({ suggestions });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Filesystem] Autocomplete error: ${errorMsg}`);
      res.status(500).json({ suggestions: [], error: errorMsg });
    }
  });

  /**
   * GET /api/filesystem/validate
   * Validates that a path exists and is a directory
   */
  router.get('/filesystem/validate', (req, res) => {
    try {
      const inputPath = req.query.path as string;

      if (!inputPath) {
        res.json({ valid: false, error: 'No path provided' });
        return;
      }

      // Expand ~ to home directory
      let expandedPath = inputPath;
      if (inputPath.startsWith('~')) {
        const homeDir = process.env.HOME || '/';
        expandedPath = inputPath.replace(/^~/, homeDir);
      }

      // Remove trailing slash for validation
      const cleanPath = expandedPath.replace(/\/+$/, '');

      if (!fs.existsSync(cleanPath)) {
        res.json({ valid: false, error: 'Path does not exist' });
        return;
      }

      const stats = fs.statSync(cleanPath);
      if (!stats.isDirectory()) {
        res.json({ valid: false, error: 'Path is not a directory' });
        return;
      }

      res.json({ valid: true, resolvedPath: cleanPath });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      res.json({ valid: false, error: errorMsg });
    }
  });

  app.use('/api', router);
}
