import { spawn, execSync, exec } from 'child_process';
import * as fs from 'fs';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class PromptSender {
  /**
   * Send a prompt via tmux send-keys (for managed sessions)
   */
  async sendViaTmux(tmuxName: string, prompt: string): Promise<{ success: boolean; error?: string }> {
    if (!tmuxName) {
      return { success: false, error: 'No tmux session name provided' };
    }

    // Security: validate tmux session name format
    if (!tmuxName.startsWith('claude-web-')) {
      return { success: false, error: 'Invalid tmux session name format' };
    }

    try {
      // Escape single quotes for shell
      const escapedText = prompt.replace(/'/g, "'\\''");

      // Send the text first using -l for literal mode (prevents interpretation of special chars)
      // Then send C-m (Ctrl+M) which is the raw carriage return to submit
      const typeCommand = `tmux send-keys -t "${tmuxName}" -l '${escapedText}'`;
      const enterCommand = `tmux send-keys -t "${tmuxName}" C-m`;
      console.log(`[PromptSender] Sending via tmux to ${tmuxName}`);

      await execAsync(typeCommand);
      await execAsync(enterCommand);

      console.log(`[PromptSender] Successfully sent prompt via tmux to ${tmuxName}`);
      return { success: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[PromptSender] tmux send-keys failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Send a prompt to a Claude Code session by injecting keystrokes.
   * Tries TIOCSTI ioctl first, falls back to xdotool if available.
   * @param pid The process ID of the Claude Code session
   * @param prompt The prompt text to send
   * @returns Promise that resolves to success status
   */
  async sendPrompt(tty: string, prompt: string, pid?: number): Promise<{ success: boolean; error?: string }> {
    if (!tty) {
      return { success: false, error: 'No TTY available for this session' };
    }

    // Validate TTY path
    if (!tty.startsWith('/dev/pts/') && !tty.startsWith('/dev/tty')) {
      return { success: false, error: `Invalid TTY path: ${tty}` };
    }

    console.log(`[PromptSender] Attempting to send prompt to TTY: ${tty}, PID: ${pid}`);

    // Try TIOCSTI first
    const tiocResult = await this.sendViaTiocsti(tty, prompt);
    if (tiocResult.success) {
      return tiocResult;
    }

    console.log(`[PromptSender] TIOCSTI failed: ${tiocResult.error}`);

    // TIOCSTI can fail with EPERM (blocked by kernel) or EIO (cross-session)
    // Try xdotool/ydotool as fallback
    console.log('[PromptSender] Trying xdotool/ydotool fallback...');

    // Try xdotool (X11)
    const xdoResult = await this.sendViaXdotool(prompt, pid);
    if (xdoResult.success) {
      return xdoResult;
    }
    console.log(`[PromptSender] xdotool failed: ${xdoResult.error}`);

    // Try ydotool (Wayland)
    const ydoResult = await this.sendViaYdotool(prompt);
    if (ydoResult.success) {
      return ydoResult;
    }
    console.log(`[PromptSender] ydotool failed: ${ydoResult.error}`);

    // All methods failed
    return {
      success: false,
      error: `TIOCSTI failed (${tiocResult.error}). Install xdotool (X11) or ydotool (Wayland) and focus the Claude terminal window to use input injection.`,
    };
  }

  private async sendViaTiocsti(ttyPath: string, prompt: string): Promise<{ success: boolean; error?: string }> {
    // Check if TTY is accessible
    try {
      await fs.promises.access(ttyPath, fs.constants.R_OK | fs.constants.W_OK);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Cannot access ${ttyPath}: ${msg}` };
    }

    // Use Python to inject keystrokes via TIOCSTI ioctl
    // TIOCSTI = 0x5412 on Linux
    const pythonScript = `
import sys
import fcntl
import os

tty_path = sys.argv[1]
text = sys.argv[2]

try:
    fd = os.open(tty_path, os.O_RDWR)
    try:
        for char in text:
            fcntl.ioctl(fd, 0x5412, char.encode())
        # Send Enter key
        fcntl.ioctl(fd, 0x5412, b'\\n')
    finally:
        os.close(fd)
    print("OK")
except PermissionError as e:
    print(f"EPERM: {e}", file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
`;

    return new Promise((resolve) => {
      const proc = spawn('python3', ['-c', pythonScript, ttyPath, prompt]);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 && stdout.trim() === 'OK') {
          console.log(`[PromptSender] Sent prompt via TIOCSTI to ${ttyPath}`);
          resolve({ success: true });
        } else {
          const error = stderr.trim() || `Process exited with code ${code}`;
          resolve({ success: false, error });
        }
      });

      proc.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });
  }

  private async sendViaXdotool(prompt: string, pid?: number): Promise<{ success: boolean; error?: string }> {
    // Check if xdotool is available
    try {
      execSync('which xdotool', { stdio: 'pipe' });
    } catch {
      return { success: false, error: 'xdotool not installed' };
    }

    // Check if we're on X11
    if (!process.env.DISPLAY) {
      return { success: false, error: 'No DISPLAY set (not X11?)' };
    }

    return new Promise((resolve) => {
      // Get the current active window so we can restore it
      let originalWindow: string | null = null;
      try {
        originalWindow = execSync('xdotool getactivewindow', { stdio: 'pipe' }).toString().trim();
      } catch {
        // Ignore if we can't get current window
      }

      let targetWindow: string | null = null;

      // Method 1: Find window by PID (most reliable)
      if (pid) {
        try {
          // Find windows owned by this PID or its parent
          const windows = execSync(`xdotool search --pid ${pid}`, { stdio: 'pipe' }).toString().trim();
          if (windows) {
            targetWindow = windows.split('\n')[0];
            console.log(`[PromptSender] Found window by PID ${pid}: ${targetWindow}`);
          }
        } catch {
          // Try parent PID (terminal is usually the parent)
          try {
            const ppid = execSync(`ps -o ppid= -p ${pid}`, { stdio: 'pipe' }).toString().trim();
            if (ppid) {
              const windows = execSync(`xdotool search --pid ${ppid}`, { stdio: 'pipe' }).toString().trim();
              if (windows) {
                targetWindow = windows.split('\n')[0];
                console.log(`[PromptSender] Found window by parent PID ${ppid}: ${targetWindow}`);
              }
            }
          } catch {
            // Ignore
          }
        }
      }

      // Method 2: Find by terminal class names
      if (!targetWindow) {
        const terminalClasses = ['kitty', 'Alacritty', 'gnome-terminal', 'konsole', 'xterm', 'terminator', 'tilix', 'urxvt', 'st', 'foot', 'wezterm', 'ghostty'];
        for (const termClass of terminalClasses) {
          try {
            const windows = execSync(`xdotool search --class "${termClass}"`, { stdio: 'pipe' }).toString().trim();
            if (windows) {
              targetWindow = windows.split('\n')[0];
              console.log(`[PromptSender] Found terminal window (${termClass}): ${targetWindow}`);
              break;
            }
          } catch {
            // No windows found with this class, try next
          }
        }
      }

      // Method 3: Search by window name containing "claude" or common terminal titles
      if (!targetWindow) {
        try {
          const windows = execSync('xdotool search --name "claude"', { stdio: 'pipe' }).toString().trim();
          if (windows) {
            targetWindow = windows.split('\n')[0];
            console.log(`[PromptSender] Found window by name 'claude': ${targetWindow}`);
          }
        } catch {
          // Ignore
        }
      }

      if (!targetWindow) {
        console.log('[PromptSender] No terminal window found, typing to focused window');
        console.log('[PromptSender] Please focus the Claude terminal window manually');
      }

      const typeAndEnter = () => {
        const proc = spawn('xdotool', ['type', '--clearmodifiers', '--delay', '0', '--', prompt]);

        proc.on('close', (code) => {
          if (code === 0) {
            // Now press Enter
            const enterProc = spawn('xdotool', ['key', 'Return']);
            enterProc.on('close', (enterCode) => {
              // Restore original window focus if we changed it
              if (originalWindow && targetWindow) {
                try {
                  execSync(`xdotool windowactivate ${originalWindow}`, { stdio: 'pipe' });
                } catch {
                  // Ignore restore errors
                }
              }

              if (enterCode === 0) {
                console.log('[PromptSender] Sent prompt via xdotool');
                resolve({ success: true });
              } else {
                resolve({ success: false, error: `xdotool key failed with code ${enterCode}` });
              }
            });
            enterProc.on('error', (err) => {
              resolve({ success: false, error: err.message });
            });
          } else {
            resolve({ success: false, error: `xdotool type failed with code ${code}` });
          }
        });

        proc.on('error', (err) => {
          resolve({ success: false, error: err.message });
        });
      };

      if (targetWindow) {
        // Activate the terminal window first
        const activateProc = spawn('xdotool', ['windowactivate', '--sync', targetWindow]);
        activateProc.on('close', (code) => {
          if (code === 0) {
            // Small delay to ensure window is focused
            setTimeout(typeAndEnter, 100);
          } else {
            // Activation failed, try typing anyway
            typeAndEnter();
          }
        });
        activateProc.on('error', () => {
          typeAndEnter();
        });
      } else {
        typeAndEnter();
      }
    });
  }

  private async sendViaYdotool(prompt: string): Promise<{ success: boolean; error?: string }> {
    // Check if ydotool is available (for Wayland)
    try {
      execSync('which ydotool', { stdio: 'pipe' });
    } catch {
      return { success: false, error: 'ydotool not installed' };
    }

    return new Promise((resolve) => {
      // ydotool type command with enter key at the end
      const fullText = prompt + '\n';
      const proc = spawn('ydotool', ['type', '--', fullText]);

      proc.on('close', (code) => {
        if (code === 0) {
          console.log('[PromptSender] Sent prompt via ydotool');
          resolve({ success: true });
        } else {
          resolve({ success: false, error: `ydotool failed with code ${code}` });
        }
      });

      proc.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });
  }
}
