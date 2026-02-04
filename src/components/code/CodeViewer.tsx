'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useCodeBrowserStore } from '@/stores/codeBrowserStore';
import { useThemeStore } from '@/stores/themeStore';
import { fetchFileContent, saveFileContent } from '@/lib/codeApi';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, FileWarning, Code, GitCompare, Save, Circle } from 'lucide-react';
import type { editor } from 'monaco-editor';

// Dynamically import Monaco Editor to avoid SSR issues
const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then((mod) => mod.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

// Dynamically import Monaco DiffEditor
const MonacoDiffEditor = dynamic(
  () => import('@monaco-editor/react').then((mod) => mod.DiffEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

interface CodeViewerProps {
  rootPath: string;
}

// Helper to get the resolved theme
const getResolvedTheme = (theme: 'light' | 'dark' | 'system'): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light';
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
};

export function CodeViewer({ rootPath }: CodeViewerProps) {
  const {
    selectedFile,
    getFileContent,
    setFileContent,
    updateFileContent,
    markFileClean,
    isFileDirty,
    viewMode,
    setViewMode,
    diffView,
  } = useCodeBrowserStore();
  const theme = useThemeStore((state) => state.theme);
  const resolvedTheme = getResolvedTheme(theme);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const cachedContent = selectedFile ? getFileContent(selectedFile) : undefined;
  const isDirty = selectedFile ? isFileDirty(selectedFile) : false;

  // Check if current file has a diff available
  const hasDiff = diffView && diffView.filePath === selectedFile;

  // Handle saving file
  const handleSave = useCallback(async () => {
    if (!selectedFile || isSaving) return;

    // Get the latest content directly from the store at execution time
    // This avoids stale closure issues where cachedContent might be outdated
    const currentContent = useCodeBrowserStore.getState().fileContent.get(selectedFile);
    if (!currentContent) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      await saveFileContent(selectedFile, rootPath, currentContent.content);
      markFileClean(selectedFile);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save file';
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  }, [selectedFile, rootPath, isSaving, markFileClean]);

  // Handle editor change
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (selectedFile && value !== undefined) {
      updateFileContent(selectedFile, value);
      setSaveError(null);
    }
  }, [selectedFile, updateFileContent]);

  // Handle editor mount for keyboard shortcuts
  const handleEditorMount = useCallback((editor: editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;

    // Add Ctrl+S / Cmd+S save shortcut
    editor.addCommand(
      // Monaco uses KeyMod.CtrlCmd for Ctrl on Windows/Linux and Cmd on Mac
      2048 /* KeyMod.CtrlCmd */ | 49 /* KeyCode.KeyS */,
      () => {
        handleSave();
      }
    );
  }, [handleSave]);

  useEffect(() => {
    if (!selectedFile) return;

    // Check if already cached
    if (cachedContent) return;

    setIsLoading(true);
    setError(null);

    fetchFileContent(selectedFile, rootPath)
      .then((response) => {
        setFileContent(selectedFile, {
          content: response.content,
          language: response.language,
          isBinary: response.isBinary,
        });
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [selectedFile, rootPath, cachedContent, setFileContent]);

  if (!selectedFile) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <FileWarning className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-sm">Select a file to view its contents</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (cachedContent?.isBinary) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <FileWarning className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-sm">Binary file cannot be displayed</p>
        <p className="text-xs mt-1">{selectedFile.split('/').pop()}</p>
      </div>
    );
  }

  // Get filename for display
  const filename = selectedFile.split('/').pop() || 'file';

  // Show diff view
  if (viewMode === 'diff' && hasDiff && diffView) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-3 py-2 border-b bg-muted/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-mono truncate" title={selectedFile}>
              {filename}
            </span>
            <span className="text-xs text-muted-foreground">(diff)</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode('code')}
            className="h-7 gap-1"
          >
            <Code className="h-3 w-3" />
            View Code
          </Button>
        </div>
        <div className="flex-1 min-h-0">
          <MonacoDiffEditor
            height="100%"
            language={diffView.language}
            original={diffView.originalContent}
            modified={diffView.modifiedContent}
            theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
            options={{
              readOnly: true,
              renderSideBySide: true,
              minimap: { enabled: false },
              lineNumbers: 'on',
              automaticLayout: true,
              scrollBeyondLastLine: false,
              fontSize: 13,
              wordWrap: 'on',
              renderOverviewRuler: true,
              diffWordWrap: 'on',
              scrollbar: {
                vertical: 'visible',
                horizontal: 'visible',
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10,
              },
            }}
          />
        </div>
      </div>
    );
  }

  // Show regular code view
  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b bg-muted/50 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-mono truncate" title={selectedFile}>
            {filename}
          </span>
          {isDirty && (
            <Circle className="h-2 w-2 fill-orange-500 text-orange-500 flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-1">
          {saveError && (
            <span className="text-xs text-destructive mr-2">{saveError}</span>
          )}
          {isDirty && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="h-7 gap-1"
            >
              {isSaving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              Save
            </Button>
          )}
          {hasDiff && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('diff')}
              className="h-7 gap-1"
            >
              <GitCompare className="h-3 w-3" />
              View Diff
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {cachedContent && (
          <MonacoEditor
            height="100%"
            language={cachedContent.language}
            value={cachedContent.content}
            theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
            onChange={handleEditorChange}
            onMount={handleEditorMount}
            options={{
              minimap: { enabled: true },
              lineNumbers: 'on',
              automaticLayout: true,
              scrollBeyondLastLine: false,
              fontSize: 13,
              wordWrap: 'on',
              renderLineHighlight: 'all',
              selectionHighlight: true,
              occurrencesHighlight: 'singleFile',
              folding: true,
              foldingStrategy: 'indentation',
              links: true,
              contextmenu: true,
              scrollbar: {
                vertical: 'visible',
                horizontal: 'visible',
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10,
              },
            }}
          />
        )}
      </div>
    </div>
  );
}
