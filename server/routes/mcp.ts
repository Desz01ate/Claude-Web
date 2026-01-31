import { Router, Express } from 'express';
import type { MCPStore } from '../services/MCPStore';
import type { MCPServer } from '../../src/types';

export function setupMCPRoutes(app: Express, mcpStore: MCPStore): void {
  const router = Router();

  /**
   * GET /api/mcp/servers
   * Get all MCP servers
   */
  router.get('/mcp/servers', (req, res) => {
    try {
      const servers = mcpStore.getMCPServers();
      res.json(servers);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: errorMsg });
    }
  });

  /**
   * GET /api/mcp/servers/:name
   * Get a specific MCP server
   */
  router.get('/mcp/servers/:name', (req, res) => {
    try {
      const { name } = req.params;
      const server = mcpStore.getMCPServer(name);

      if (!server) {
        res.status(404).json({ error: `Server "${name}" not found` });
        return;
      }

      res.json({ name, ...server });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: errorMsg });
    }
  });

  /**
   * PUT /api/mcp/servers/:name
   * Create or update an MCP server
   */
  router.put('/mcp/servers/:name', async (req, res) => {
    try {
      const { name } = req.params;
      const serverConfig = req.body as MCPServer;

      // Validate request body
      if (!serverConfig || typeof serverConfig !== 'object') {
        res.status(400).json({ error: 'Invalid request body' });
        return;
      }

      // Ensure required fields are present
      if (!serverConfig.type) {
        res.status(400).json({ error: 'Missing required field: type' });
        return;
      }
      if (!serverConfig.command) {
        res.status(400).json({ error: 'Missing required field: command' });
        return;
      }
      if (!Array.isArray(serverConfig.args)) {
        res.status(400).json({ error: 'Missing or invalid field: args (must be an array)' });
        return;
      }
      if (!serverConfig.env || typeof serverConfig.env !== 'object') {
        res.status(400).json({ error: 'Missing or invalid field: env (must be an object)' });
        return;
      }

      const result = mcpStore.setMCPServer(name, serverConfig);
      res.json(result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      // Handle validation errors specifically
      if (err instanceof Error && err.name === 'ValidationError') {
        res.status(400).json({ error: errorMsg });
      } else {
        res.status(500).json({ error: errorMsg });
      }
    }
  });

  /**
   * DELETE /api/mcp/servers/:name
   * Delete an MCP server
   */
  router.delete('/mcp/servers/:name', (req, res) => {
    try {
      const { name } = req.params;
      const result = mcpStore.deleteMCPServer(name);
      res.json(result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      // Handle "not found" errors specifically
      if (errorMsg.includes('not found')) {
        res.status(404).json({ error: errorMsg });
      } else {
        res.status(500).json({ error: errorMsg });
      }
    }
  });

  /**
   * POST /api/mcp/servers/:name/test
   * Test if an MCP server can start successfully
   */
  router.post('/mcp/servers/:name/test', async (req, res) => {
    try {
      const { name } = req.params;
      const result = await mcpStore.testMCPServer(name);
      res.json(result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      // Handle "not found" errors specifically
      if (errorMsg.includes('not found')) {
        res.status(404).json({ error: errorMsg, success: false });
      } else {
        res.status(500).json({ error: errorMsg, success: false });
      }
    }
  });

  app.use('/api', router);
}
