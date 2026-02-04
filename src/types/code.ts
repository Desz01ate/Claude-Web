// Code browser types

export interface TreeEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
}

export interface DirectoryTreeResponse {
  entries: TreeEntry[];
  path: string;
  error?: string;
}

export interface FileContentResponse {
  content: string;
  path: string;
  language: string;
  size: number;
  error?: string;
  isBinary?: boolean;
}

export interface GitStatusFile {
  path: string;
  status: 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '?' | '!'; // Modified, Added, Deleted, Renamed, Copied, Unmerged, Untracked, Ignored
  staged: boolean;
}

export interface GitStatusResponse {
  branch: string;
  isRepo: boolean;
  files: GitStatusFile[];
  ahead?: number;
  behind?: number;
  error?: string;
}

export interface GitDiffResponse {
  diff: string;
  file?: string;
  error?: string;
}

// Monaco language mappings for common file extensions
export const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  // JavaScript/TypeScript
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',

  // Web
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'scss',
  '.less': 'less',
  '.vue': 'html',
  '.svelte': 'html',

  // Data formats
  '.json': 'json',
  '.jsonc': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.xml': 'xml',
  '.toml': 'ini',
  '.ini': 'ini',
  '.env': 'ini',

  // Documentation
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.rst': 'restructuredtext',
  '.txt': 'plaintext',

  // Backend languages
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
  '.fs': 'fsharp',
  '.vb': 'vb',
  '.lua': 'lua',
  '.r': 'r',
  '.R': 'r',
  '.pl': 'perl',
  '.pm': 'perl',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.clj': 'clojure',
  '.hs': 'haskell',
  '.ml': 'fsharp',
  '.dart': 'dart',

  // Shell
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.fish': 'shell',
  '.ps1': 'powershell',
  '.bat': 'bat',
  '.cmd': 'bat',

  // Config files
  '.dockerfile': 'dockerfile',
  '.gitignore': 'ini',
  '.gitattributes': 'ini',
  '.editorconfig': 'ini',
  '.prettierrc': 'json',
  '.eslintrc': 'json',
  '.babelrc': 'json',

  // Database
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.prisma': 'graphql',
};

// Binary file extensions that should not be displayed in the editor
export const BINARY_EXTENSIONS = new Set([
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
