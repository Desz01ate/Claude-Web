import * as fs from 'fs';
import * as path from 'path';
import type { AppConfig } from '../../src/types';

const DEFAULT_CONFIG: AppConfig = {
  maxConcurrentSessions: 5,
  defaultWorkingDirectory: undefined,
};

export class ConfigStore {
  private configDir: string;
  private configPath: string;
  private config: AppConfig;

  constructor() {
    const homeDir = process.env.HOME || '/tmp';
    this.configDir = path.join(homeDir, '.claude-web');
    this.configPath = path.join(this.configDir, 'config.json');
    this.config = { ...DEFAULT_CONFIG };
    this.load();
  }

  /**
   * Load configuration from disk
   */
  private load(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        const parsed = JSON.parse(data);
        this.config = { ...DEFAULT_CONFIG, ...parsed };
        console.log(`[ConfigStore] Loaded config from ${this.configPath}`);
      } else {
        console.log('[ConfigStore] No config file found, using defaults');
      }
    } catch (err) {
      console.error(`[ConfigStore] Error loading config: ${err}`);
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  /**
   * Save configuration to disk
   */
  private save(): void {
    try {
      // Ensure config directory exists
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }

      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
      console.log(`[ConfigStore] Saved config to ${this.configPath}`);
    } catch (err) {
      console.error(`[ConfigStore] Error saving config: ${err}`);
      throw err;
    }
  }

  /**
   * Get the current configuration
   */
  getConfig(): AppConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<AppConfig>): AppConfig {
    // Validate maxConcurrentSessions
    if (updates.maxConcurrentSessions !== undefined) {
      const max = updates.maxConcurrentSessions;
      if (typeof max !== 'number' || max < 1 || max > 20) {
        throw new Error('maxConcurrentSessions must be between 1 and 20');
      }
      this.config.maxConcurrentSessions = max;
    }

    // Validate defaultWorkingDirectory
    if (updates.defaultWorkingDirectory !== undefined) {
      if (updates.defaultWorkingDirectory === '' || updates.defaultWorkingDirectory === null) {
        this.config.defaultWorkingDirectory = undefined;
      } else {
        // Verify directory exists
        if (!fs.existsSync(updates.defaultWorkingDirectory)) {
          throw new Error(`Directory does not exist: ${updates.defaultWorkingDirectory}`);
        }
        const stats = fs.statSync(updates.defaultWorkingDirectory);
        if (!stats.isDirectory()) {
          throw new Error(`Path is not a directory: ${updates.defaultWorkingDirectory}`);
        }
        this.config.defaultWorkingDirectory = updates.defaultWorkingDirectory;
      }
    }

    this.save();
    return this.getConfig();
  }

  /**
   * Get maximum concurrent sessions
   */
  getMaxConcurrentSessions(): number {
    return this.config.maxConcurrentSessions;
  }

  /**
   * Get default working directory
   */
  getDefaultWorkingDirectory(): string | undefined {
    return this.config.defaultWorkingDirectory;
  }
}
