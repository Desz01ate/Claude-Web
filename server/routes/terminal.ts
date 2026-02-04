import { Router, Express, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as pty from 'node-pty';
import { Server as SocketIOServer } from 'socket.io';

// Environment variable to disable terminal feature entirely
const TERMINAL_DISABLED = process.env.TERMINAL_DISABLED === 'true';

// Store active terminal sessions
const terminalSessions = new Map<string, pty.IPty>();

// Rate limiting state
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10;

/**
 * Simple rate limiter based on IP address
 */
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const requests = rateLimitMap.get(ip) || [];
  const recentRequests = requests.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  recentRequests.push(now);
  rateLimitMap.set(ip, recentRequests);
  return false;
}

/**
 * Resolve and validate that a path is within the allowed root.
 */
function resolveAndValidatePath(targetPath: string, rootPath: string): { valid: boolean; resolvedPath?: string; error?: string } {
  try {
    const resolvedRoot = fs.realpathSync(rootPath);

    if (!fs.existsSync(targetPath)) {
      return { valid: false, error: 'Path does not exist' };
    }

    const resolvedTarget = fs.realpathSync(targetPath);

    if (!resolvedTarget.startsWith(resolvedRoot + path.sep) && resolvedTarget !== resolvedRoot) {
      return { valid: false, error: 'Access denied: path outside root directory' };
    }

    const stats = fs.statSync(resolvedTarget);
    if (!stats.isDirectory()) {
      return { valid: false, error: 'Path is not a directory' };
    }

    return { valid: true, resolvedPath: resolvedTarget };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { valid: false, error: errorMsg };
  }
}

/**
 * Generate a unique terminal session ID
 */
function generateSessionId(): string {
  return `term_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function setupTerminalRoutes(app: Express): void {
  const router = Router();

  /**
   * GET /api/terminal/available
   * Check if terminal feature is available
   */
  router.get('/terminal/available', (_req: Request, res: Response) => {
    try {
      if (TERMINAL_DISABLED) {
        res.json({
          available: false,
          reason: 'Terminal feature is disabled via TERMINAL_DISABLED environment variable',
        });
        return;
      }

      res.json({
        available: true,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Terminal] Availability check error: ${errorMsg}`);
      res.status(500).json({ error: errorMsg });
    }
  });

  /**
   * POST /api/terminal/create
   * Create a new terminal session
   */
  router.post('/terminal/create', (req: Request, res: Response) => {
    try {
      if (TERMINAL_DISABLED) {
        res.status(503).json({ error: 'Terminal feature is disabled' });
        return;
      }

      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      if (isRateLimited(clientIp)) {
        res.status(429).json({ error: 'Too many requests. Please wait.' });
        return;
      }

      const { path: targetPath, rootPath } = req.body;

      if (!targetPath || !rootPath) {
        res.status(400).json({ error: 'path and rootPath are required' });
        return;
      }

      const validation = resolveAndValidatePath(targetPath, rootPath);
      if (!validation.valid) {
        res.status(403).json({ error: validation.error });
        return;
      }

      const sessionId = generateSessionId();
      const shell = process.env.SHELL || '/bin/bash';

      // Create PTY process
      const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: validation.resolvedPath,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
        },
      });

      terminalSessions.set(sessionId, ptyProcess);

      console.log(`[Terminal] Created session ${sessionId} at ${validation.resolvedPath}`);

      res.json({
        success: true,
        sessionId,
        path: validation.resolvedPath,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Terminal] Create error: ${errorMsg}`);
      res.status(500).json({ error: errorMsg });
    }
  });

  /**
   * POST /api/terminal/resize
   * Resize a terminal session
   */
  router.post('/terminal/resize', (req: Request, res: Response) => {
    try {
      const { sessionId, cols, rows } = req.body;

      if (!sessionId || !cols || !rows) {
        res.status(400).json({ error: 'sessionId, cols, and rows are required' });
        return;
      }

      const ptyProcess = terminalSessions.get(sessionId);
      if (!ptyProcess) {
        res.status(404).json({ error: 'Terminal session not found' });
        return;
      }

      ptyProcess.resize(cols, rows);
      res.json({ success: true });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Terminal] Resize error: ${errorMsg}`);
      res.status(500).json({ error: errorMsg });
    }
  });

  /**
   * POST /api/terminal/close
   * Close a terminal session
   */
  router.post('/terminal/close', (req: Request, res: Response) => {
    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        res.status(400).json({ error: 'sessionId is required' });
        return;
      }

      const ptyProcess = terminalSessions.get(sessionId);
      if (ptyProcess) {
        ptyProcess.kill();
        terminalSessions.delete(sessionId);
        console.log(`[Terminal] Closed session ${sessionId}`);
      }

      res.json({ success: true });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Terminal] Close error: ${errorMsg}`);
      res.status(500).json({ error: errorMsg });
    }
  });

  app.use('/api', router);
}

/**
 * Setup WebSocket handlers for terminal I/O
 */
export function setupTerminalWebSocket(io: SocketIOServer): void {
  io.on('connection', (socket) => {
    // Handle terminal attach
    socket.on('terminal:attach', (sessionId: string) => {
      const ptyProcess = terminalSessions.get(sessionId);
      if (!ptyProcess) {
        socket.emit('terminal:error', { error: 'Terminal session not found' });
        return;
      }

      console.log(`[Terminal] Socket ${socket.id} attached to session ${sessionId}`);

      // Send PTY output to client
      const dataHandler = (data: string) => {
        socket.emit('terminal:data', { sessionId, data });
      };
      ptyProcess.onData(dataHandler);

      // Handle PTY exit
      const exitHandler = () => {
        socket.emit('terminal:exit', { sessionId });
        terminalSessions.delete(sessionId);
      };
      ptyProcess.onExit(exitHandler);

      // Handle client input
      const inputHandler = ({ sessionId: sid, data }: { sessionId: string; data: string }) => {
        if (sid === sessionId) {
          const proc = terminalSessions.get(sessionId);
          if (proc) {
            proc.write(data);
          }
        }
      };
      socket.on('terminal:input', inputHandler);

      // Cleanup on disconnect
      socket.on('disconnect', () => {
        console.log(`[Terminal] Socket ${socket.id} disconnected from session ${sessionId}`);
      });
    });
  });
}

/**
 * Cleanup all terminal sessions (for graceful shutdown)
 */
export function cleanupTerminalSessions(): void {
  for (const [sessionId, ptyProcess] of terminalSessions) {
    console.log(`[Terminal] Cleaning up session ${sessionId}`);
    ptyProcess.kill();
  }
  terminalSessions.clear();
}
