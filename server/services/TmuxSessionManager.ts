import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { ConfigStore } from './ConfigStore';

const execAsync = promisify(exec);

export interface TmuxCreateResult {
  success: boolean;
  tmuxName?: string;
  error?: string;
}

export interface TmuxResult {
  success: boolean;
  error?: string;
}

export class TmuxSessionManager {
  private static SESSION_PREFIX = 'claude-web-';
  private configStore: ConfigStore;

  constructor(configStore: ConfigStore) {
    this.configStore = configStore;
  }

  /**
   * Get the claude command to use (custom path or default)
   */
  private getClaudeCommand(): string {
    return this.configStore.getClaudeCommandPath() || 'claude';
  }

  static async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }


  /**
   * Check if tmux is available on the system
   */
  async checkTmuxAvailable(): Promise<boolean> {
    try {
      await execAsync('which tmux');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resume a previous Claude session in a new tmux session
   */
  async resumeSession(sessionId: string, workingDirectory: string): Promise<TmuxCreateResult> {
    // Verify tmux is available
    if (!(await this.checkTmuxAvailable())) {
      return { success: false, error: 'tmux is not installed or not in PATH' };
    }

    // Generate unique tmux session name
    const tmuxId = uuidv4().slice(0, 8);
    const tmuxName = `${TmuxSessionManager.SESSION_PREFIX}${tmuxId}`;

    try {
      // Verify directory exists
      const { stdout: dirCheck } = await execAsync(`test -d "${workingDirectory}" && echo "exists"`);
      if (!dirCheck.trim()) {
        return { success: false, error: `Directory does not exist: ${workingDirectory}` };
      }

      // Create tmux session with a shell first (session stays alive even if command fails)
      // Then send the claude --resume command to it
      const createCommand = `tmux new-session -d -s "${tmuxName}" -c "${workingDirectory}"`;
      console.log(`[TmuxSessionManager] Creating session for resume: ${createCommand}`);

      await execAsync(createCommand);

      // Verify the session was created
      const running = await this.isSessionRunning(tmuxName);
      if (!running) {
        return { success: false, error: 'Session was created but is not running' };
      }

      // Now send the claude --resume command
      const claudeCmd = this.getClaudeCommand();
      const resumeCommand = `tmux send-keys -t "${tmuxName}" "${claudeCmd} --resume ${sessionId}" Enter`;
      console.log(`[TmuxSessionManager] Sending resume command: ${resumeCommand}`);
      await execAsync(resumeCommand);

      console.log(`[TmuxSessionManager] Resumed session: ${tmuxName} (claude session: ${sessionId})`);
      return { success: true, tmuxName };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[TmuxSessionManager] Failed to resume session: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Create a new tmux session running Claude Code
   */
  async createSession(workingDirectory: string): Promise<TmuxCreateResult> {
    // Verify tmux is available
    if (!(await this.checkTmuxAvailable())) {
      return { success: false, error: 'tmux is not installed or not in PATH' };
    }

    // Generate unique session name
    const sessionId = uuidv4().slice(0, 8);
    const tmuxName = `${TmuxSessionManager.SESSION_PREFIX}${sessionId}`;

    try {
      // Verify directory exists
      const { stdout: dirCheck } = await execAsync(`test -d "${workingDirectory}" && echo "exists"`);
      if (!dirCheck.trim()) {
        return { success: false, error: `Directory does not exist: ${workingDirectory}` };
      }

      // Create tmux session with a shell first (session stays alive even if command fails)
      // Then send the claude command to it
      // -d: detached
      // -s: session name
      // -c: starting directory
      const createCommand = `tmux new-session -d -s "${tmuxName}" -c "${workingDirectory}"`;
      console.log(`[TmuxSessionManager] Creating session: ${createCommand}`);

      await execAsync(createCommand);

      // Verify the session was created
      const running = await this.isSessionRunning(tmuxName);
      if (!running) {
        return { success: false, error: 'Session was created but is not running' };
      }

      // Now send the claude command
      const claudeCmd = this.getClaudeCommand();
      const claudeCommand = `tmux send-keys -t "${tmuxName}" "${claudeCmd}" Enter`;
      console.log(`[TmuxSessionManager] Sending claude command: ${claudeCommand}`);
      await execAsync(claudeCommand);

      // In case the directory was never run Claude before, this will allow it to accept the warning regarding read/edit
      // A few ms of delay is needed for claude's warning to show up.
      await TmuxSessionManager.sleep(2000);
      const enterCommand = `tmux send-keys -t "${tmuxName}" C-m`;
      console.log(`[TmuxSessionManager] Sending enter command: ${enterCommand}`);
      await exec(enterCommand);


      console.log(`[TmuxSessionManager] Created session: ${tmuxName}`);
      return { success: true, tmuxName };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[TmuxSessionManager] Failed to create session: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Destroy a tmux session
   */
  async destroySession(tmuxName: string): Promise<TmuxResult> {
    // Security: validate session name format
    if (!tmuxName.startsWith(TmuxSessionManager.SESSION_PREFIX)) {
      return { success: false, error: 'Invalid session name format' };
    }

    try {
      const command = `tmux kill-session -t "${tmuxName}"`;
      console.log(`[TmuxSessionManager] Destroying session: ${command}`);

      await execAsync(command);

      console.log(`[TmuxSessionManager] Destroyed session: ${tmuxName}`);
      return { success: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      // Session might already be gone
      if (errorMsg.includes('no server running') || errorMsg.includes("can't find session")) {
        return { success: true }; // Consider it destroyed
      }
      console.error(`[TmuxSessionManager] Failed to destroy session: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Send keystrokes to a tmux session
   */
  async sendKeys(tmuxName: string, text: string): Promise<TmuxResult> {
    // Security: validate session name format
    if (!tmuxName.startsWith(TmuxSessionManager.SESSION_PREFIX)) {
      return { success: false, error: 'Invalid session name format' };
    }

    try {
      // Escape special characters for tmux send-keys
      // We use a heredoc approach to safely pass the text
      const escapedText = text.replace(/'/g, "'\\''");

      // Send the text first, then send Enter separately
      // Using C-m (Ctrl+M) which is the raw carriage return character
      const typeCommand = `tmux send-keys -t "${tmuxName}" -l '${escapedText}'`;
      const enterCommand = `tmux send-keys -t "${tmuxName}" C-m`;
      console.log(`[TmuxSessionManager] Sending keys to ${tmuxName}: ${text.slice(0, 50)}...`);

      await execAsync(typeCommand);
      await execAsync(enterCommand);

      return { success: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[TmuxSessionManager] Failed to send keys: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Send a special key (like S-Tab, C-c, etc.) to a tmux session without literal flag
   */
  async sendSpecialKey(tmuxName: string, key: string): Promise<TmuxResult> {
    // Security: validate session name format
    if (!tmuxName.startsWith(TmuxSessionManager.SESSION_PREFIX)) {
      return { success: false, error: 'Invalid session name format' };
    }

    try {
      // Send key without -l flag so tmux interprets key names like S-Tab, C-c, etc.
      const command = `tmux send-keys -t "${tmuxName}" ${key}`;
      console.log(`[TmuxSessionManager] Sending special key to ${tmuxName}: ${key}`);

      await execAsync(command);

      return { success: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[TmuxSessionManager] Failed to send special key: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Check if a tmux session is still running
   */
  async isSessionRunning(tmuxName: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}"');
      const sessions = stdout.trim().split('\n');
      return sessions.includes(tmuxName);
    } catch {
      // tmux server might not be running if there are no sessions
      return false;
    }
  }

  /**
   * List all claude-web managed sessions
   */
  async listManagedSessions(): Promise<string[]> {
    try {
      const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}"');
      const sessions = stdout.trim().split('\n');
      return sessions.filter(s => s.startsWith(TmuxSessionManager.SESSION_PREFIX));
    } catch {
      return [];
    }
  }

  /**
   * Get working directory of a tmux session
   */
  async getSessionCwd(tmuxName: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync(`tmux display-message -t "${tmuxName}" -p "#{pane_current_path}"`);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }
}
