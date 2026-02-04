import type {
  DirectoryTreeResponse,
  FileContentResponse,
  GitStatusResponse,
  GitDiffResponse,
} from '@/types/code';

function getApiBase(): string {
  if (typeof window === 'undefined') return 'http://localhost:3001';

  // Use environment variable if set
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl) return envUrl;

  // When behind a reverse proxy (nginx), use same origin
  // For local dev without proxy, specify port 3001 explicitly
  if (process.env.NODE_ENV === 'production') {
    // In production, assume reverse proxy - use same origin
    return window.location.origin;
  }

  // Development: use same host but port 3001
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  return `${protocol}//${window.location.hostname}:3001`;
}

/**
 * Fetch directory tree from the server
 */
export async function fetchDirectoryTree(
  path: string,
  rootPath: string,
  showHidden: boolean = false
): Promise<DirectoryTreeResponse> {
  const params = new URLSearchParams({
    path,
    rootPath,
    showHidden: showHidden.toString(),
  });

  const response = await fetch(`${getApiBase()}/api/code/tree?${params}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch directory tree');
  }

  return data;
}

/**
 * Fetch file content from the server
 */
export async function fetchFileContent(
  path: string,
  rootPath: string
): Promise<FileContentResponse> {
  const params = new URLSearchParams({
    path,
    rootPath,
  });

  const response = await fetch(`${getApiBase()}/api/code/file?${params}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch file content');
  }

  return data;
}

/**
 * Fetch git status for a repository
 */
export async function fetchGitStatus(path: string): Promise<GitStatusResponse> {
  const params = new URLSearchParams({ path });

  const response = await fetch(`${getApiBase()}/api/git/status?${params}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch git status');
  }

  return data;
}

/**
 * Fetch git diff for a file or all changes
 */
export async function fetchGitDiff(
  path: string,
  file?: string,
  staged: boolean = false
): Promise<GitDiffResponse> {
  const params = new URLSearchParams({ path, staged: staged.toString() });
  if (file) {
    params.set('file', file);
  }

  const response = await fetch(`${getApiBase()}/api/git/diff?${params}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch git diff');
  }

  return data;
}

/**
 * Save file content to the server
 */
export async function saveFileContent(
  path: string,
  rootPath: string,
  content: string
): Promise<{ success: boolean; path: string }> {
  const response = await fetch(`${getApiBase()}/api/code/file`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path, rootPath, content }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to save file');
  }

  return data;
}

/**
 * Fetch file content from a git ref (default: HEAD)
 */
export async function fetchGitFileContent(
  path: string,
  file: string,
  ref: string = 'HEAD'
): Promise<{ content: string; exists: boolean }> {
  const params = new URLSearchParams({ path, file, ref });

  const response = await fetch(`${getApiBase()}/api/git/show?${params}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch git file content');
  }

  return data;
}

/**
 * Check if terminal feature is available on the server
 */
export async function checkTerminalAvailable(): Promise<{ available: boolean; reason?: string }> {
  const response = await fetch(`${getApiBase()}/api/terminal/available`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to check terminal availability');
  }

  return data;
}

/**
 * Create a new terminal session
 */
export async function createTerminalSession(
  path: string,
  rootPath: string
): Promise<{ success: boolean; sessionId?: string; path?: string; error?: string }> {
  const response = await fetch(`${getApiBase()}/api/terminal/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path, rootPath }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to create terminal session');
  }

  return data;
}

/**
 * Resize a terminal session
 */
export async function resizeTerminal(
  sessionId: string,
  cols: number,
  rows: number
): Promise<{ success: boolean }> {
  const response = await fetch(`${getApiBase()}/api/terminal/resize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessionId, cols, rows }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to resize terminal');
  }

  return data;
}

/**
 * Close a terminal session
 */
export async function closeTerminalSession(sessionId: string): Promise<{ success: boolean }> {
  const response = await fetch(`${getApiBase()}/api/terminal/close`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessionId }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to close terminal session');
  }

  return data;
}
