import { create } from 'zustand';
import type { MCPServer, MCPServersResponse, MCPServerWithMeta } from '@/types';

interface MCPStoreState {
  servers: Record<string, MCPServer>;
  loading: boolean;
  error: string | null;
  testResult: { name: string; success: boolean; output?: string; error?: string } | null;
}

interface MCPStoreActions {
  fetchServers: () => Promise<void>;
  addServer: (name: string, config: MCPServer) => Promise<void>;
  updateServer: (name: string, config: MCPServer) => Promise<void>;
  deleteServer: (name: string) => Promise<void>;
  testServer: (name: string) => Promise<void>;
  clearError: () => void;
  clearTestResult: () => void;
}

type MCPStore = MCPStoreState & MCPStoreActions;

export const useMCPStore = create<MCPStore>((set, get) => ({
  // Initial state
  servers: {},
  loading: false,
  error: null,
  testResult: null,

  // Fetch all MCP servers
  fetchServers: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/mcp/servers');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch MCP servers');
      }
      const data: MCPServersResponse = await res.json();
      set({ servers: data.mcpServers || {}, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        loading: false
      });
    }
  },

  // Add a new MCP server
  addServer: async (name: string, config: MCPServer) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/mcp/servers/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add MCP server');
      }
      const data: MCPServersResponse = await res.json();
      set({ servers: data.mcpServers || {}, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        loading: false
      });
      throw err; // Re-throw for caller to handle
    }
  },

  // Update an existing MCP server
  updateServer: async (name: string, config: MCPServer) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/mcp/servers/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update MCP server');
      }
      const data: MCPServersResponse = await res.json();
      set({ servers: data.mcpServers || {}, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        loading: false
      });
      throw err; // Re-throw for caller to handle
    }
  },

  // Delete an MCP server
  deleteServer: async (name: string) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/mcp/servers/${name}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete MCP server');
      }
      const data: MCPServersResponse = await res.json();
      set({ servers: data.mcpServers || {}, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        loading: false
      });
      throw err; // Re-throw for caller to handle
    }
  },

  // Test an MCP server
  testServer: async (name: string) => {
    set({ loading: true, error: null, testResult: null });
    try {
      const res = await fetch(`/api/mcp/servers/${name}/test`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to test MCP server');
      }
      const data = await res.json();
      set({
        testResult: { name, ...data },
        loading: false
      });
    } catch (err) {
      set({
        testResult: {
          name,
          success: false,
          error: err instanceof Error ? err.message : String(err)
        },
        loading: false
      });
    }
  },

  // Clear error state
  clearError: () => set({ error: null }),

  // Clear test result
  clearTestResult: () => set({ testResult: null }),
}));

// Helper selector to get servers as an array with metadata
export const useServerList = (): MCPServerWithMeta[] => {
  const servers = useMCPStore((state) => state.servers);
  return Object.entries(servers).map(([name, config]) => ({
    name,
    ...config
  }));
};
