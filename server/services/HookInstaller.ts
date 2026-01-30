import * as fs from 'fs';
import * as path from 'path';
import type { SetupStatus } from '../../src/types';

const HOOK_SCRIPT_NAME = 'claude-web-state.py';
const SOCKET_PATH = '/tmp/claude-web.sock';

// Hook entry with matcher (for tool-based events)
interface HookEntryWithMatcher {
  matcher: string;
  hooks: Array<{ type: string; command: string }>;
}

// Hook entry without matcher (for non-tool events)
interface HookEntryWithoutMatcher {
  hooks: Array<{ type: string; command: string }>;
}

type HookEntry = HookEntryWithMatcher | HookEntryWithoutMatcher;

// Get the directory of the current module
function getResourcesDir(): string {
  const possiblePaths = [
    path.join(process.cwd(), 'server', 'resources'),
    path.join(process.cwd(), 'resources'),
    path.join(__dirname, '..', 'resources'),
    path.join(__dirname, 'resources'),
  ];

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(path.join(p, HOOK_SCRIPT_NAME))) {
        return p;
      }
    } catch {
      continue;
    }
  }

  return path.join(process.cwd(), 'server', 'resources');
}

export class HookInstaller {
  private homeDir: string;
  private claudeDir: string;
  private hooksDir: string;
  private settingsPath: string;
  private resourcesDir: string;

  // Events that use matchers (tool-based)
  private readonly toolBasedEvents = ['PreToolUse', 'PostToolUse', 'PermissionRequest', 'Notification'];
  // Events that don't use matchers
  private readonly nonToolEvents = ['UserPromptSubmit', 'Stop', 'SubagentStop', 'SessionStart', 'SessionEnd', 'PreCompact'];

  constructor() {
    this.homeDir = process.env.HOME || '/tmp';
    this.claudeDir = path.join(this.homeDir, '.claude');
    this.hooksDir = path.join(this.claudeDir, 'hooks');
    this.settingsPath = path.join(this.claudeDir, 'settings.json');
    this.resourcesDir = getResourcesDir();
  }

  async checkStatus(): Promise<SetupStatus> {
    const errors: string[] = [];
    const hookPath = path.join(this.hooksDir, HOOK_SCRIPT_NAME);

    let installed = false;
    try {
      await fs.promises.access(hookPath, fs.constants.X_OK);
      installed = true;
    } catch {
      installed = false;
    }

    let settingsConfigured = false;
    try {
      const settingsContent = await fs.promises.readFile(this.settingsPath, 'utf-8');
      const settings = JSON.parse(settingsContent);

      if (settings.hooks) {
        const coreHookTypes = ['PreToolUse', 'PermissionRequest', 'Notification'];
        settingsConfigured = coreHookTypes.every((type) => {
          const hookEntries = settings.hooks[type];
          if (!Array.isArray(hookEntries)) return false;

          return hookEntries.some((entry: HookEntry) => {
            if (!entry.hooks || !Array.isArray(entry.hooks)) return false;
            return entry.hooks.some((h) => h.command?.includes(HOOK_SCRIPT_NAME));
          });
        });
      }
    } catch {
      settingsConfigured = false;
    }

    return {
      installed,
      hookPath: installed ? hookPath : undefined,
      settingsConfigured,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async install(): Promise<SetupStatus> {
    const errors: string[] = [];

    try {
      await fs.promises.mkdir(this.hooksDir, { recursive: true });

      const sourcePath = path.join(this.resourcesDir, HOOK_SCRIPT_NAME);
      const destPath = path.join(this.hooksDir, HOOK_SCRIPT_NAME);

      try {
        const scriptContent = await fs.promises.readFile(sourcePath, 'utf-8');
        await fs.promises.writeFile(destPath, scriptContent, { mode: 0o755 });
      } catch (err) {
        errors.push(`Failed to copy hook script: ${err}`);
        return { installed: false, settingsConfigured: false, errors };
      }

      let settings: Record<string, unknown> = {};
      try {
        const settingsContent = await fs.promises.readFile(this.settingsPath, 'utf-8');
        settings = JSON.parse(settingsContent);
      } catch {
        // File doesn't exist or is invalid, start fresh
      }

      if (!settings.hooks) {
        settings.hooks = {};
      }

      const hooks = settings.hooks as Record<string, HookEntry[]>;
      const hookCommand = destPath;

      // Add hooks for tool-based events (with matcher: "*")
      for (const eventType of this.toolBasedEvents) {
        const ourHookEntry: HookEntryWithMatcher = {
          matcher: '*',
          hooks: [{ type: 'command', command: hookCommand }],
        };

        if (!hooks[eventType]) {
          hooks[eventType] = [];
        }

        const existingIndex = hooks[eventType].findIndex((entry) => {
          if (!entry.hooks || !Array.isArray(entry.hooks)) return false;
          return entry.hooks.some((h) => h.command?.includes(HOOK_SCRIPT_NAME));
        });

        if (existingIndex >= 0) {
          hooks[eventType][existingIndex] = ourHookEntry;
        } else {
          hooks[eventType].push(ourHookEntry);
        }
      }

      // Add hooks for non-tool events (without matcher)
      for (const eventType of this.nonToolEvents) {
        const ourHookEntry: HookEntryWithoutMatcher = {
          hooks: [{ type: 'command', command: hookCommand }],
        };

        if (!hooks[eventType]) {
          hooks[eventType] = [];
        }

        const existingIndex = hooks[eventType].findIndex((entry) => {
          if (!entry.hooks || !Array.isArray(entry.hooks)) return false;
          return entry.hooks.some((h) => h.command?.includes(HOOK_SCRIPT_NAME));
        });

        if (existingIndex >= 0) {
          hooks[eventType][existingIndex] = ourHookEntry;
        } else {
          hooks[eventType].push(ourHookEntry);
        }
      }

      await fs.promises.writeFile(
        this.settingsPath,
        JSON.stringify(settings, null, 2),
        'utf-8'
      );

      return this.checkStatus();
    } catch (err) {
      errors.push(`Installation failed: ${err}`);
      return { installed: false, settingsConfigured: false, errors };
    }
  }

  async uninstall(): Promise<SetupStatus> {
    const errors: string[] = [];

    try {
      const hookPath = path.join(this.hooksDir, HOOK_SCRIPT_NAME);
      try {
        await fs.promises.unlink(hookPath);
      } catch {
        // File might not exist
      }

      try {
        const settingsContent = await fs.promises.readFile(this.settingsPath, 'utf-8');
        const settings = JSON.parse(settingsContent);

        if (settings.hooks) {
          for (const eventType of Object.keys(settings.hooks)) {
            if (Array.isArray(settings.hooks[eventType])) {
              settings.hooks[eventType] = settings.hooks[eventType].filter(
                (entry: HookEntry) => {
                  if (!entry.hooks || !Array.isArray(entry.hooks)) return true;
                  return !entry.hooks.some((h) => h.command?.includes(HOOK_SCRIPT_NAME));
                }
              );
              if (settings.hooks[eventType].length === 0) {
                delete settings.hooks[eventType];
              }
            }
          }
          if (Object.keys(settings.hooks).length === 0) {
            delete settings.hooks;
          }
        }

        await fs.promises.writeFile(
          this.settingsPath,
          JSON.stringify(settings, null, 2),
          'utf-8'
        );
      } catch {
        // Settings file might not exist
      }

      try {
        await fs.promises.unlink(SOCKET_PATH);
      } catch {
        // Socket might not exist
      }

      return this.checkStatus();
    } catch (err) {
      errors.push(`Uninstallation failed: ${err}`);
      return { installed: true, settingsConfigured: true, errors };
    }
  }
}
