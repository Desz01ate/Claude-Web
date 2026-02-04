import { Router, Express } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Maximum file size to read (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Git command timeout (10 seconds)
const GIT_TIMEOUT = 10000;

// Binary file extensions that should not be displayed
const BINARY_EXTENSIONS = new Set([
  // Images
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg', '.tiff', '.tif',
  // Audio
  '.mp3', '.wav', '.ogg', '.flac', '.aac', '.wma', '.m4a',
  // Video
  '.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.webm',
  // Archives
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz',
  // Executables
  '.exe', '.dll', '.so', '.dylib', '.bin',
  // Documents
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  // Fonts
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  // Database
  '.db', '.sqlite', '.sqlite3',
  // Other
  '.lock', '.pyc', '.pyo', '.class', '.o', '.obj',
]);

// Language mapping for Monaco Editor
const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'scss',
  '.less': 'less',
  '.vue': 'html',
  '.svelte': 'html',
  '.json': 'json',
  '.jsonc': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.xml': 'xml',
  '.toml': 'ini',
  '.ini': 'ini',
  '.env': 'ini',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.txt': 'plaintext',
  '.py': 'python',
  '.pyw': 'python',
  '.rb': 'ruby',
  '.php': 'php',
  '.java': 'java',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.go': 'go',
  '.rs': 'rust',
  '.swift': 'swift',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.fish': 'shell',
  '.ps1': 'powershell',
  '.bat': 'bat',
  '.cmd': 'bat',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.dockerfile': 'dockerfile',
  '.gitignore': 'ini',
  '.gitattributes': 'ini',
  '.editorconfig': 'ini',
  '.prettierrc': 'json',
  '.eslintrc': 'json',
  '.babelrc': 'json',
};

/**
 * Check if a target path is within the root path (prevent directory traversal)
 */
function isPathWithinRoot(targetPath: string, rootPath: string): boolean {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(rootPath);
  return resolvedTarget.startsWith(resolvedRoot + path.sep) || resolvedTarget === resolvedRoot;
}

/**
 * Check if a file is binary based on extension
 */
function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Get Monaco language ID from file path
 */
function getMonacoLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath).toLowerCase();

  // Special file names
  if (basename === 'dockerfile') return 'dockerfile';
  if (basename === 'makefile') return 'makefile';
  if (basename === 'cmakelists.txt') return 'cmake';

  return EXTENSION_LANGUAGE_MAP[ext] || 'plaintext';
}

export function setupCodeRoutes(app: Express): void {
  const router = Router();

  /**
   * GET /api/code/tree
   * List directory contents (files and folders)
   */
  router.get('/code/tree', async (req, res) => {
    try {
      const targetPath = req.query.path as string;
      const rootPath = req.query.rootPath as string;
      const showHidden = req.query.showHidden === 'true';

      if (!targetPath || !rootPath) {
        res.status(400).json({ error: 'path and rootPath are required' });
        return;
      }

      // Validate path is within root
      if (!isPathWithinRoot(targetPath, rootPath)) {
        res.status(403).json({ error: 'Access denied: path outside root directory' });
        return;
      }

      // Check if path exists and is a directory
      if (!fs.existsSync(targetPath)) {
        res.status(404).json({ error: 'Path does not exist' });
        return;
      }

      const stats = fs.statSync(targetPath);
      if (!stats.isDirectory()) {
        res.status(400).json({ error: 'Path is not a directory' });
        return;
      }

      // Read directory entries
      const entries = await fs.promises.readdir(targetPath, { withFileTypes: true });

      const result = entries
        .filter((entry) => {
          // Filter hidden files unless requested
          if (!showHidden && entry.name.startsWith('.')) {
            return false;
          }
          return true;
        })
        .map((entry) => {
          const fullPath = path.join(targetPath, entry.name);
          let size: number | undefined;

          if (entry.isFile()) {
            try {
              const fileStats = fs.statSync(fullPath);
              size = fileStats.size;
            } catch {
              // Ignore stat errors
            }
          }

          return {
            name: entry.name,
            path: fullPath,
            type: entry.isDirectory() ? 'directory' : 'file',
            size,
          };
        })
        .sort((a, b) => {
          // Directories first, then alphabetically
          if (a.type === 'directory' && b.type !== 'directory') return -1;
          if (a.type !== 'directory' && b.type === 'directory') return 1;
          return a.name.localeCompare(b.name);
        });

      res.json({ entries: result, path: targetPath });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Code] Tree error: ${errorMsg}`);
      res.status(500).json({ error: errorMsg });
    }
  });

  /**
   * GET /api/code/file
   * Read file content with language detection
   */
  router.get('/code/file', async (req, res) => {
    try {
      const filePath = req.query.path as string;
      const rootPath = req.query.rootPath as string;

      if (!filePath || !rootPath) {
        res.status(400).json({ error: 'path and rootPath are required' });
        return;
      }

      // Validate path is within root
      if (!isPathWithinRoot(filePath, rootPath)) {
        res.status(403).json({ error: 'Access denied: path outside root directory' });
        return;
      }

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'File does not exist' });
        return;
      }

      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        res.status(400).json({ error: 'Path is not a file' });
        return;
      }

      // Check file size
      if (stats.size > MAX_FILE_SIZE) {
        res.status(413).json({
          error: `File too large (${Math.round(stats.size / 1024 / 1024)}MB). Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
          size: stats.size,
          path: filePath,
          language: getMonacoLanguage(filePath),
        });
        return;
      }

      // Check if binary
      if (isBinaryFile(filePath)) {
        res.json({
          content: '',
          path: filePath,
          language: 'plaintext',
          size: stats.size,
          isBinary: true,
        });
        return;
      }

      // Read file content
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const language = getMonacoLanguage(filePath);

      res.json({
        content,
        path: filePath,
        language,
        size: stats.size,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Code] File read error: ${errorMsg}`);
      res.status(500).json({ error: errorMsg });
    }
  });

  /**
   * GET /api/git/status
   * Get git status, branch name, and changed files
   */
  router.get('/git/status', (req, res) => {
    try {
      const targetPath = req.query.path as string;

      if (!targetPath) {
        res.status(400).json({ error: 'path is required' });
        return;
      }

      // Check if directory exists
      if (!fs.existsSync(targetPath)) {
        res.status(404).json({ error: 'Path does not exist' });
        return;
      }

      // Check if it's a git repository
      try {
        execSync('git rev-parse --is-inside-work-tree', {
          cwd: targetPath,
          timeout: GIT_TIMEOUT,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch {
        res.json({ isRepo: false, branch: '', files: [] });
        return;
      }

      // Get current branch
      let branch = '';
      try {
        branch = execSync('git branch --show-current', {
          cwd: targetPath,
          timeout: GIT_TIMEOUT,
          encoding: 'utf-8',
        }).trim();

        // If no branch (detached HEAD), get the commit hash
        if (!branch) {
          branch = execSync('git rev-parse --short HEAD', {
            cwd: targetPath,
            timeout: GIT_TIMEOUT,
            encoding: 'utf-8',
          }).trim();
          branch = `HEAD (${branch})`;
        }
      } catch {
        branch = 'unknown';
      }

      // Get ahead/behind count
      let ahead = 0;
      let behind = 0;
      try {
        const status = execSync('git status -sb', {
          cwd: targetPath,
          timeout: GIT_TIMEOUT,
          encoding: 'utf-8',
        });
        const match = status.match(/\[ahead (\d+)(?:, behind (\d+))?\]|\[behind (\d+)\]/);
        if (match) {
          ahead = parseInt(match[1] || '0', 10);
          behind = parseInt(match[2] || match[3] || '0', 10);
        }
      } catch {
        // Ignore errors
      }

      // Get changed files
      const files: Array<{ path: string; status: string; staged: boolean }> = [];
      try {
        // Get staged files
        const staged = execSync('git diff --cached --name-status', {
          cwd: targetPath,
          timeout: GIT_TIMEOUT,
          encoding: 'utf-8',
        });
        staged.split('\n').filter(Boolean).forEach((line) => {
          const [status, filePath] = line.split('\t');
          if (filePath) {
            files.push({ path: filePath, status: status as string, staged: true });
          }
        });

        // Get unstaged modified files
        const unstaged = execSync('git diff --name-status', {
          cwd: targetPath,
          timeout: GIT_TIMEOUT,
          encoding: 'utf-8',
        });
        unstaged.split('\n').filter(Boolean).forEach((line) => {
          const [status, filePath] = line.split('\t');
          if (filePath) {
            // Check if already in staged list
            const existing = files.find((f) => f.path === filePath);
            if (!existing) {
              files.push({ path: filePath, status: status as string, staged: false });
            }
          }
        });

        // Get untracked files
        const untracked = execSync('git ls-files --others --exclude-standard', {
          cwd: targetPath,
          timeout: GIT_TIMEOUT,
          encoding: 'utf-8',
        });
        untracked.split('\n').filter(Boolean).forEach((filePath) => {
          files.push({ path: filePath, status: '?', staged: false });
        });
      } catch {
        // Ignore errors
      }

      res.json({
        isRepo: true,
        branch,
        files,
        ahead,
        behind,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Git] Status error: ${errorMsg}`);
      res.status(500).json({ error: errorMsg });
    }
  });

  /**
   * GET /api/git/diff
   * Get unified diff for a file or all changes
   */
  router.get('/git/diff', (req, res) => {
    try {
      const targetPath = req.query.path as string;
      const file = req.query.file as string | undefined;
      const staged = req.query.staged === 'true';

      if (!targetPath) {
        res.status(400).json({ error: 'path is required' });
        return;
      }

      // Check if directory exists
      if (!fs.existsSync(targetPath)) {
        res.status(404).json({ error: 'Path does not exist' });
        return;
      }

      // Build git diff command
      let cmd = 'git diff';
      if (staged) {
        cmd += ' --cached';
      }
      if (file) {
        // Validate file is within the repo
        const fullFilePath = path.resolve(targetPath, file);
        if (!isPathWithinRoot(fullFilePath, targetPath)) {
          res.status(403).json({ error: 'Access denied: file outside root directory' });
          return;
        }
        cmd += ` -- "${file}"`;
      }

      let diff = '';
      try {
        diff = execSync(cmd, {
          cwd: targetPath,
          timeout: GIT_TIMEOUT,
          encoding: 'utf-8',
          maxBuffer: MAX_FILE_SIZE,
        });
      } catch (err) {
        // Git diff returns non-zero for some cases, but still outputs diff
        if (err && typeof err === 'object' && 'stdout' in err) {
          diff = (err as { stdout: string }).stdout || '';
        }
      }

      res.json({
        diff,
        file: file || null,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Git] Diff error: ${errorMsg}`);
      res.status(500).json({ error: errorMsg });
    }
  });

  /**
   * GET /api/git/show
   * Get file content from a specific git ref (default: HEAD)
   */
  router.get('/git/show', (req, res) => {
    try {
      const targetPath = req.query.path as string;
      const file = req.query.file as string;
      const ref = (req.query.ref as string) || 'HEAD';

      if (!targetPath || !file) {
        res.status(400).json({ error: 'path and file are required' });
        return;
      }

      // Validate file is within the repo
      const fullFilePath = path.resolve(targetPath, file);
      if (!isPathWithinRoot(fullFilePath, targetPath)) {
        res.status(403).json({ error: 'Access denied: file outside root directory' });
        return;
      }

      // Check if directory exists
      if (!fs.existsSync(targetPath)) {
        res.status(404).json({ error: 'Path does not exist' });
        return;
      }

      let content = '';
      try {
        content = execSync(`git show "${ref}:${file}"`, {
          cwd: targetPath,
          timeout: GIT_TIMEOUT,
          encoding: 'utf-8',
          maxBuffer: MAX_FILE_SIZE,
        });
      } catch (err) {
        // File might not exist in the ref (e.g., new file)
        res.json({ content: '', exists: false });
        return;
      }

      res.json({ content, exists: true });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Git] Show error: ${errorMsg}`);
      res.status(500).json({ error: errorMsg });
    }
  });

  app.use('/api', router);
}
