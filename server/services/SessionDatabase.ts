import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import type { RecentSession } from '../../src/types';

export class SessionDatabase {
  private db: Database.Database;
  private dbPath: string;

  constructor() {
    const homeDir = process.env.HOME || '/tmp';
    const configDir = path.join(homeDir, '.claude-web');

    // Ensure config directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    this.dbPath = path.join(configDir, 'sessions.db');
    this.db = new Database(this.dbPath);

    // Enable WAL mode for better concurrent read performance
    this.db.pragma('journal_mode = WAL');

    this.initSchema();
    console.log(`[SessionDatabase] Initialized at ${this.dbPath}`);
  }

  /**
   * Initialize database schema
   */
  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        cwd TEXT NOT NULL,
        project_name TEXT NOT NULL,
        conversation_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_activity DATETIME NOT NULL,
        ended_at DATETIME,
        message_count INTEGER DEFAULT 0,
        last_user_message TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity DESC);
    `);
  }

  /**
   * Save a new session to the database
   */
  saveSession(session: {
    sessionId: string;
    cwd: string;
    projectName: string;
    conversationPath?: string;
    lastActivity: Date;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, cwd, project_name, conversation_path, last_activity)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        cwd = excluded.cwd,
        project_name = excluded.project_name,
        conversation_path = excluded.conversation_path,
        last_activity = excluded.last_activity
    `);

    stmt.run(
      session.sessionId,
      session.cwd,
      session.projectName,
      session.conversationPath || null,
      session.lastActivity.toISOString()
    );

    console.log(`[SessionDatabase] Saved session: ${session.sessionId}`);
  }

  /**
   * Update the last activity timestamp for a session
   */
  updateSessionActivity(sessionId: string, lastActivity: Date): void {
    const stmt = this.db.prepare(`
      UPDATE sessions SET last_activity = ? WHERE id = ?
    `);
    stmt.run(lastActivity.toISOString(), sessionId);
  }

  /**
   * Mark a session as ended
   */
  markSessionEnded(sessionId: string): void {
    const stmt = this.db.prepare(`
      UPDATE sessions SET ended_at = ? WHERE id = ?
    `);
    stmt.run(new Date().toISOString(), sessionId);
    console.log(`[SessionDatabase] Marked session ended: ${sessionId}`);
  }

  /**
   * Update message count and last user message preview
   */
  updateMessagePreview(sessionId: string, messageCount: number, lastUserMessage?: string): void {
    const stmt = this.db.prepare(`
      UPDATE sessions SET message_count = ?, last_user_message = ? WHERE id = ?
    `);
    stmt.run(messageCount, lastUserMessage || null, sessionId);
  }

  /**
   * Get recent sessions for UI display
   * @param limit Maximum number of sessions to return
   * @param excludeActiveIds Session IDs to exclude (active sessions)
   */
  getRecentSessions(limit: number = 10, excludeActiveIds: string[] = []): RecentSession[] {
    let query = `
      SELECT
        id as sessionId,
        cwd,
        project_name as projectName,
        conversation_path as conversationPath,
        created_at as createdAt,
        last_activity as lastActivity,
        ended_at as endedAt,
        message_count as messageCount,
        last_user_message as lastUserMessage
      FROM sessions
      WHERE ended_at IS NOT NULL
    `;

    const params: unknown[] = [];

    if (excludeActiveIds.length > 0) {
      const placeholders = excludeActiveIds.map(() => '?').join(', ');
      query += ` AND id NOT IN (${placeholders})`;
      params.push(...excludeActiveIds);
    }

    query += ` ORDER BY last_activity DESC LIMIT ?`;
    params.push(limit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as Array<{
      sessionId: string;
      cwd: string;
      projectName: string;
      conversationPath: string | null;
      createdAt: string;
      lastActivity: string;
      endedAt: string | null;
      messageCount: number;
      lastUserMessage: string | null;
    }>;

    return rows.map(row => ({
      sessionId: row.sessionId,
      cwd: row.cwd,
      projectName: row.projectName,
      conversationPath: row.conversationPath || undefined,
      createdAt: new Date(row.createdAt),
      lastActivity: new Date(row.lastActivity),
      endedAt: row.endedAt ? new Date(row.endedAt) : undefined,
      messageCount: row.messageCount,
      lastUserMessage: row.lastUserMessage || undefined,
    }));
  }

  /**
   * Check if a session exists in the database
   */
  sessionExists(sessionId: string): boolean {
    const stmt = this.db.prepare('SELECT 1 FROM sessions WHERE id = ?');
    const result = stmt.get(sessionId);
    return result !== undefined;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): RecentSession | undefined {
    const stmt = this.db.prepare(`
      SELECT
        id as sessionId,
        cwd,
        project_name as projectName,
        conversation_path as conversationPath,
        created_at as createdAt,
        last_activity as lastActivity,
        ended_at as endedAt,
        message_count as messageCount,
        last_user_message as lastUserMessage
      FROM sessions
      WHERE id = ?
    `);

    const row = stmt.get(sessionId) as {
      sessionId: string;
      cwd: string;
      projectName: string;
      conversationPath: string | null;
      createdAt: string;
      lastActivity: string;
      endedAt: string | null;
      messageCount: number;
      lastUserMessage: string | null;
    } | undefined;

    if (!row) return undefined;

    return {
      sessionId: row.sessionId,
      cwd: row.cwd,
      projectName: row.projectName,
      conversationPath: row.conversationPath || undefined,
      createdAt: new Date(row.createdAt),
      lastActivity: new Date(row.lastActivity),
      endedAt: row.endedAt ? new Date(row.endedAt) : undefined,
      messageCount: row.messageCount,
      lastUserMessage: row.lastUserMessage || undefined,
    };
  }

  /**
   * Delete a session from the database
   */
  deleteSession(sessionId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
    const result = stmt.run(sessionId);
    const deleted = result.changes > 0;
    if (deleted) {
      console.log(`[SessionDatabase] Deleted session: ${sessionId}`);
    }
    return deleted;
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
    console.log('[SessionDatabase] Closed database connection');
  }
}
