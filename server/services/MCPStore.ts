import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import type { MCPServer, MCPServersResponse } from '../../src/types';

// Path to Claude's configuration file
const CLAUDE_CONFIG_PATH = path.join(process.env.HOME || '/tmp', '.claude.json');

// Validation constants
const SERVER_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const MAX_COMMAND_LENGTH = 1024;
const MAX_ARG_LENGTH = 4096;
const MAX_ENV_VALUE_LENGTH = 8192;

// Validation errors
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class MCPStore {
  /**
   * Read all MCP servers from ~/.claude.json
   */
  getMCPServers(): MCPServersResponse {
    try {
      if (!fs.existsSync(CLAUDE_CONFIG_PATH)) {
        // File doesn't exist yet, return empty config
        return { mcpServers: {} };
      }

      const data = fs.readFileSync(CLAUDE_CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(data);

      // Only return the mcpServers section
      return {
        mcpServers: parsed.mcpServers || {}
      };
    } catch (err) {
      console.error(`[MCPStore] Error reading config: ${err}`);
      throw new Error(`Failed to read Claude configuration: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Get a specific MCP server by name
   */
  getMCPServer(name: string): MCPServer | null {
    const servers = this.getMCPServers();
    return servers.mcpServers[name] || null;
  }

  /**
   * Validate server name
   */
  private validateServerName(name: string): void {
    if (!name || typeof name !== 'string') {
      throw new ValidationError('Server name is required');
    }
    if (!SERVER_NAME_REGEX.test(name)) {
      throw new ValidationError('Server name must contain only alphanumeric characters, hyphens, and underscores');
    }
    if (name.length > 64) {
      throw new ValidationError('Server name must be 64 characters or less');
    }
  }

  /**
   * Validate MCPServer configuration
   */
  private validateServerConfig(config: MCPServer): void {
    // Validate type
    if (!config.type || typeof config.type !== 'string') {
      throw new ValidationError('Server type is required');
    }
    if (config.type !== 'stdio' && config.type !== 'sse') {
      throw new ValidationError('Server type must be either "stdio" or "sse"');
    }

    // Validate command
    if (!config.command || typeof config.command !== 'string') {
      throw new ValidationError('Command is required');
    }
    if (config.command.length > MAX_COMMAND_LENGTH) {
      throw new ValidationError(`Command must be ${MAX_COMMAND_LENGTH} characters or less`);
    }

    // Validate args
    if (!Array.isArray(config.args)) {
      throw new ValidationError('Args must be an array');
    }
    for (const arg of config.args) {
      if (typeof arg !== 'string') {
        throw new ValidationError('All args must be strings');
      }
      if (arg.length > MAX_ARG_LENGTH) {
        throw new ValidationError(`Each arg must be ${MAX_ARG_LENGTH} characters or less`);
      }
    }

    // Validate env
    if (config.env && typeof config.env !== 'object') {
      throw new ValidationError('Env must be an object');
    }
    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        if (typeof value !== 'string') {
          throw new ValidationError(`Environment variable ${key} must be a string`);
        }
        if (value.length > MAX_ENV_VALUE_LENGTH) {
          throw new ValidationError(`Environment variable ${key} must be ${MAX_ENV_VALUE_LENGTH} characters or less`);
        }
      }
    }
  }

  /**
   * Set or update an MCP server configuration
   */
  setMCPServer(name: string, config: MCPServer): MCPServersResponse {
    // Validate inputs
    this.validateServerName(name);
    this.validateServerConfig(config);

    // Read current config
    let currentConfig: Record<string, unknown> = {};
    if (fs.existsSync(CLAUDE_CONFIG_PATH)) {
      const data = fs.readFileSync(CLAUDE_CONFIG_PATH, 'utf-8');
      currentConfig = JSON.parse(data);
    }

    // Ensure mcpServers object exists
    if (!currentConfig.mcpServers || typeof currentConfig.mcpServers !== 'object') {
      currentConfig.mcpServers = {};
    }

    // Update the server config
    (currentConfig.mcpServers as Record<string, MCPServer>)[name] = config;

    // Write atomically (temp file + rename)
    this.writeAtomic(currentConfig);

    return this.getMCPServers();
  }

  /**
   * Delete an MCP server configuration
   */
  deleteMCPServer(name: string): MCPServersResponse {
    // Validate name
    this.validateServerName(name);

    // Read current config
    if (!fs.existsSync(CLAUDE_CONFIG_PATH)) {
      throw new Error('Configuration file does not exist');
    }

    const data = fs.readFileSync(CLAUDE_CONFIG_PATH, 'utf-8');
    const currentConfig = JSON.parse(data);

    // Check if server exists
    if (!currentConfig.mcpServers || !(name in currentConfig.mcpServers)) {
      throw new Error(`Server "${name}" not found`);
    }

    // Delete the server
    delete currentConfig.mcpServers[name];

    // Write atomically
    this.writeAtomic(currentConfig);

    return this.getMCPServers();
  }

  /**
   * Test if an MCP server can start successfully
   * Spawns the process with a timeout and returns stdout/stderr
   */
  async testMCPServer(name: string): Promise<{ success: boolean; output?: string; error?: string }> {
    const server = this.getMCPServer(name);
    if (!server) {
      throw new Error(`Server "${name}" not found`);
    }

    if (server.type !== 'stdio') {
      throw new Error('Testing is only supported for stdio servers');
    }

    return new Promise((resolve) => {
      const timeout = 5000; // 5 second timeout
      let output = '';
      let errorOutput = '';

      try {
        const child = spawn(server.command, server.args, {
          env: { ...process.env, ...server.env },
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let resolved = false;

        // Collect stdout
        child.stdout?.on('data', (data) => {
          output += data.toString();
        });

        // Collect stderr
        child.stderr?.on('data', (data) => {
          errorOutput += data.toString();
        });

        // Handle exit
        child.on('exit', (code, signal) => {
          if (resolved) return;
          resolved = true;

          if (signal === 'SIGTERM' || code === null) {
            // Killed by timeout, which is expected for long-running servers
            resolve({
              success: true,
              output: 'Server started successfully (timed out as expected for long-running process)'
            });
          } else if (code === 0) {
            resolve({
              success: true,
              output: output || 'Server exited successfully'
            });
          } else {
            resolve({
              success: false,
              error: `Server exited with code ${code}${errorOutput ? ': ' + errorOutput : ''}`
            });
          }
        });

        // Handle spawn errors
        child.on('error', (err) => {
          if (resolved) return;
          resolved = true;
          resolve({
            success: false,
            error: `Failed to start server: ${err.message}`
          });
        });

        // Timeout after expected duration
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            child.kill('SIGTERM');
            // Give it a moment to exit cleanly
            setTimeout(() => {
              if (!child.killed) {
                child.kill('SIGKILL');
              }
            }, 100);
          }
        }, timeout);

      } catch (err) {
        resolve({
          success: false,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    });
  }

  /**
   * Write configuration atomically using temp file + rename
   */
  private writeAtomic(config: Record<string, unknown>): void {
    const tempPath = CLAUDE_CONFIG_PATH + '.tmp';

    try {
      // Write to temp file
      fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), 'utf-8');

      // Rename over original (atomic on most filesystems)
      fs.renameSync(tempPath, CLAUDE_CONFIG_PATH);

      console.log(`[MCPStore] Saved config to ${CLAUDE_CONFIG_PATH}`);
    } catch (err) {
      // Clean up temp file if write failed
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      console.error(`[MCPStore] Error saving config: ${err}`);
      throw new Error(`Failed to save configuration: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
