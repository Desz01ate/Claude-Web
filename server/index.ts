import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { HookSocketServer } from './socket/hookSocket';
import { WebSocketServer } from './socket/webSocket';
import { SessionStore } from './services/SessionStore';
import { SessionDatabase } from './services/SessionDatabase';
import { TmuxSessionManager } from './services/TmuxSessionManager';
import { ConfigStore } from './services/ConfigStore';
import { AuthService } from './services/AuthService';
import { setupRoutes } from './routes/sessions';
import { setupSetupRoutes } from './routes/setup';
import { setupFilesystemRoutes } from './routes/filesystem';
import { setupConfigRoutes } from './routes/config';
import { setupAuthRoutes } from './routes/auth';
import type { ServerToClientEvents, ClientToServerEvents } from '../src/types';

const app = express();
const httpServer = createServer(app);

// Socket.io for browser clients
const corsOrigin = process.env.CORS_ORIGIN === '*'
  ? true  // Allow all origins
  : process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://127.0.0.1:3000'];

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
  },
});

// Session database for persistence
const sessionDatabase = new SessionDatabase();

// Central session state manager
const sessionStore = new SessionStore(sessionDatabase);

// Configuration store
const configStore = new ConfigStore();

// Authentication service
const authService = new AuthService(configStore);

// Tmux session manager
const tmuxManager = new TmuxSessionManager();

// WebSocket server for browser clients
const webSocketServer = new WebSocketServer(io, sessionStore);

// Wire up tmux manager, config store, and session database
webSocketServer.setTmuxManager(tmuxManager);
webSocketServer.setConfigStore(configStore);
webSocketServer.setSessionDatabase(sessionDatabase);
webSocketServer.setAuthService(authService);

// Unix socket server for Python hook
const hookSocketServer = new HookSocketServer(sessionStore, webSocketServer);

// Wire up permission responder from WebSocket to Hook socket
webSocketServer.setPermissionResponder((sessionId, toolUseId, decision) => {
  return hookSocketServer.respondToPermission(sessionId, toolUseId, decision);
});

// Express middleware
app.use(express.json());

// Routes
setupRoutes(app, sessionStore);
setupSetupRoutes(app);
setupFilesystemRoutes(app);
setupConfigRoutes(app, configStore);
setupAuthRoutes(app, authService);

// Start servers
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

httpServer.listen(Number(PORT), HOST, () => {
  console.log(`[Server] HTTP server listening on ${HOST}:${PORT}`);
});

hookSocketServer.start();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  hookSocketServer.stop();
  sessionDatabase.close();
  httpServer.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  hookSocketServer.stop();
  sessionDatabase.close();
  httpServer.close();
  process.exit(0);
});
