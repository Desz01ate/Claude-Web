import { create } from 'zustand';
import type {
  TreeEntry,
  GitStatusResponse,
} from '@/types/code';

interface CachedFile {
  content: string;
  language: string;
  isBinary?: boolean;
  originalContent?: string; // Original content for dirty tracking
}

interface DiffViewState {
  originalContent: string;
  modifiedContent: string;
  language: string;
  filePath: string;
}

export type ViewMode = 'code' | 'diff';

interface CodeBrowserStore {
  // State
  expandedFolders: Set<string>;
  selectedFile: string | null;
  fileContent: Map<string, CachedFile>;
  treeCache: Map<string, TreeEntry[]>;
  gitStatus: GitStatusResponse | null;
  isGitPanelOpen: boolean;
  showHiddenFiles: boolean;
  isLoading: boolean;
  error: string | null;
  viewMode: ViewMode;
  diffView: DiffViewState | null;
  dirtyFiles: Set<string>; // Track modified files
  isTerminalOpen: boolean;

  // Actions
  toggleFolder: (path: string) => void;
  expandFolder: (path: string) => void;
  collapseFolder: (path: string) => void;
  selectFile: (path: string | null) => void;
  setFileContent: (path: string, content: CachedFile) => void;
  updateFileContent: (path: string, content: string) => void; // Update content and track dirty
  markFileClean: (path: string) => void; // Mark file as saved
  setTreeCache: (path: string, entries: TreeEntry[]) => void;
  setGitStatus: (status: GitStatusResponse | null) => void;
  toggleGitPanel: () => void;
  setGitPanelOpen: (open: boolean) => void;
  toggleHiddenFiles: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearCache: () => void;
  invalidateTreeCache: (rootPath?: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setDiffView: (diffView: DiffViewState | null) => void;
  openFileDiff: (filePath: string, originalContent: string, modifiedContent: string, language: string) => void;
  toggleTerminal: () => void;
  setTerminalOpen: (open: boolean) => void;

  // Getters
  isFolderExpanded: (path: string) => boolean;
  getFileContent: (path: string) => CachedFile | undefined;
  getTreeCache: (path: string) => TreeEntry[] | undefined;
  isFileDirty: (path: string) => boolean;
}

export const useCodeBrowserStore = create<CodeBrowserStore>((set, get) => ({
  // Initial state
  expandedFolders: new Set(),
  selectedFile: null,
  fileContent: new Map(),
  treeCache: new Map(),
  gitStatus: null,
  isGitPanelOpen: true,
  showHiddenFiles: false,
  isLoading: false,
  error: null,
  viewMode: 'code',
  diffView: null,
  dirtyFiles: new Set(),
  isTerminalOpen: false,

  // Actions
  toggleFolder: (path) => {
    set((state) => {
      const newExpanded = new Set(state.expandedFolders);
      if (newExpanded.has(path)) {
        newExpanded.delete(path);
      } else {
        newExpanded.add(path);
      }
      return { expandedFolders: newExpanded };
    });
  },

  expandFolder: (path) => {
    set((state) => {
      const newExpanded = new Set(state.expandedFolders);
      newExpanded.add(path);
      return { expandedFolders: newExpanded };
    });
  },

  collapseFolder: (path) => {
    set((state) => {
      const newExpanded = new Set(state.expandedFolders);
      newExpanded.delete(path);
      return { expandedFolders: newExpanded };
    });
  },

  selectFile: (path) => {
    // When selecting from the file tree, clear diff view and switch to code mode
    set({ selectedFile: path, viewMode: 'code', diffView: null });
  },

  setFileContent: (path, content) => {
    set((state) => {
      const newFileContent = new Map(state.fileContent);
      // Store original content for dirty tracking
      newFileContent.set(path, {
        ...content,
        originalContent: content.content,
      });
      return { fileContent: newFileContent };
    });
  },

  updateFileContent: (path, content) => {
    set((state) => {
      const existing = state.fileContent.get(path);
      if (!existing) return state;

      const newFileContent = new Map(state.fileContent);
      newFileContent.set(path, {
        ...existing,
        content,
      });

      // Track dirty state
      const newDirtyFiles = new Set(state.dirtyFiles);
      if (content !== existing.originalContent) {
        newDirtyFiles.add(path);
      } else {
        newDirtyFiles.delete(path);
      }

      return { fileContent: newFileContent, dirtyFiles: newDirtyFiles };
    });
  },

  markFileClean: (path) => {
    set((state) => {
      const existing = state.fileContent.get(path);
      if (!existing) return state;

      const newFileContent = new Map(state.fileContent);
      newFileContent.set(path, {
        ...existing,
        originalContent: existing.content, // Update original to current
      });

      const newDirtyFiles = new Set(state.dirtyFiles);
      newDirtyFiles.delete(path);

      return { fileContent: newFileContent, dirtyFiles: newDirtyFiles };
    });
  },

  setTreeCache: (path, entries) => {
    set((state) => {
      const newTreeCache = new Map(state.treeCache);
      newTreeCache.set(path, entries);
      return { treeCache: newTreeCache };
    });
  },

  setGitStatus: (status) => {
    set({ gitStatus: status });
  },

  toggleGitPanel: () => {
    set((state) => ({ isGitPanelOpen: !state.isGitPanelOpen }));
  },

  setGitPanelOpen: (open) => {
    set({ isGitPanelOpen: open });
  },

  toggleHiddenFiles: () => {
    set((state) => {
      // Clear tree cache when toggling hidden files
      return {
        showHiddenFiles: !state.showHiddenFiles,
        treeCache: new Map(),
      };
    });
  },

  setLoading: (loading) => {
    set({ isLoading: loading });
  },

  setError: (error) => {
    set({ error });
  },

  setViewMode: (mode) => {
    set({ viewMode: mode });
  },

  setDiffView: (diffView) => {
    set({ diffView });
  },

  openFileDiff: (filePath, originalContent, modifiedContent, language) => {
    set({
      selectedFile: filePath,
      viewMode: 'diff',
      diffView: {
        filePath,
        originalContent,
        modifiedContent,
        language,
      },
    });
  },

  toggleTerminal: () => {
    set((state) => ({ isTerminalOpen: !state.isTerminalOpen }));
  },

  setTerminalOpen: (open) => {
    set({ isTerminalOpen: open });
  },

  clearCache: () => {
    set({
      expandedFolders: new Set(),
      selectedFile: null,
      fileContent: new Map(),
      treeCache: new Map(),
      gitStatus: null,
      viewMode: 'code',
      diffView: null,
      dirtyFiles: new Set(),
      isTerminalOpen: false,
    });
  },

  invalidateTreeCache: (rootPath) => {
    set((state) => {
      const newTreeCache = new Map(state.treeCache);
      if (rootPath) {
        // Clear only entries that start with the given rootPath
        for (const key of newTreeCache.keys()) {
          if (key === rootPath || key.startsWith(rootPath + '/')) {
            newTreeCache.delete(key);
          }
        }
      } else {
        // Clear all tree cache
        newTreeCache.clear();
      }
      return { treeCache: newTreeCache };
    });
  },

  // Getters
  isFolderExpanded: (path) => {
    return get().expandedFolders.has(path);
  },

  getFileContent: (path) => {
    return get().fileContent.get(path);
  },

  getTreeCache: (path) => {
    return get().treeCache.get(path);
  },

  isFileDirty: (path) => {
    return get().dirtyFiles.has(path);
  },
}));
