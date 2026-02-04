'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { getSocket } from '@/lib/socket';
import { createTerminalSession, closeTerminalSession, resizeTerminal } from '@/lib/codeApi';
import { Button } from '@/components/ui/button';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

interface WebTerminalProps {
  path: string;
  rootPath: string;
  isVisible?: boolean;
  onClose: () => void;
}

export function WebTerminal({ path, rootPath, isVisible = true, onClose }: WebTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0); // Increment to trigger reconnection

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selectionBackground: '#264f78',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5',
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    return () => {
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Create terminal session and connect via WebSocket
  useEffect(() => {
    if (!xtermRef.current) return;

    const terminal = xtermRef.current;
    const socket = getSocket();

    const initSession = async () => {
      try {
        const result = await createTerminalSession(path, rootPath);
        if (result.success && result.sessionId) {
          const termSessionId = result.sessionId;
          setSessionId(termSessionId);
          setIsConnected(true);

          // Clear the connecting message
          terminal.clear();

          // Attach to the session via WebSocket
          socket.emit('terminal:attach', termSessionId);

          // Handle incoming data from server
          const handleData = ({ sessionId: sid, data }: { sessionId: string; data: string }) => {
            if (sid === termSessionId) {
              terminal.write(data);
            }
          };
          socket.on('terminal:data', handleData);

          // Handle terminal exit
          const handleExit = ({ sessionId: sid }: { sessionId: string }) => {
            if (sid === termSessionId) {
              terminal.writeln('\r\n[Terminal session ended. Press Enter to reconnect]');
              setIsConnected(false);
              setSessionId(null);
            }
          };
          socket.on('terminal:exit', handleExit);

          // Handle errors
          const handleError = ({ error }: { error: string }) => {
            terminal.writeln(`\r\n[Error: ${error}]`);
            setError(error);
          };
          socket.on('terminal:error', handleError);

          // Send user input to server
          const disposeOnData = terminal.onData((data) => {
            socket.emit('terminal:input', { sessionId: termSessionId, data });
          });

          // Initial resize
          if (fitAddonRef.current) {
            fitAddonRef.current.fit();
            const { cols, rows } = terminal;
            resizeTerminal(termSessionId, cols, rows).catch(console.error);
          }

          // Cleanup function
          return () => {
            socket.off('terminal:data', handleData);
            socket.off('terminal:exit', handleExit);
            socket.off('terminal:error', handleError);
            disposeOnData.dispose();
          };
        } else {
          setError(result.error || 'Failed to create terminal session');
          terminal.writeln(`\r\n[Error: ${result.error || 'Failed to create terminal session'}]`);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to connect';
        setError(errorMsg);
        terminal.writeln(`\r\n[Error: ${errorMsg}]`);
      }
    };

    terminal.writeln('Connecting to terminal...');
    const cleanupPromise = initSession();

    return () => {
      cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, [path, rootPath, reconnectKey]);

  // Handle resize
  useEffect(() => {
    if (!fitAddonRef.current || !sessionId) return;

    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit();
        const { cols, rows } = xtermRef.current;
        resizeTerminal(sessionId, cols, rows).catch(console.error);
      }
    };

    // Debounce resize
    let resizeTimeout: NodeJS.Timeout;
    const debouncedResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(handleResize, 100);
    };

    window.addEventListener('resize', debouncedResize);

    // Also resize when maximized state changes
    handleResize();

    return () => {
      window.removeEventListener('resize', debouncedResize);
      clearTimeout(resizeTimeout);
    };
  }, [sessionId, isMaximized]);

  // Handle reconnection when session has ended
  useEffect(() => {
    if (!xtermRef.current || isConnected || sessionId) return;

    const terminal = xtermRef.current;

    // Listen for Enter key to trigger reconnection
    const disposeOnData = terminal.onData((data) => {
      if (data === '\r' || data === '\n') {
        setReconnectKey((k) => k + 1);
      }
    });

    return () => {
      disposeOnData.dispose();
    };
  }, [isConnected, sessionId]);

  // Clean up terminal session on actual unmount (not just hide)
  useEffect(() => {
    return () => {
      if (sessionId) {
        closeTerminalSession(sessionId).catch(console.error);
      }
    };
  }, [sessionId]);

  // Handle close - just hide, don't kill session
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <div
      className={`flex flex-col bg-[#1e1e1e] border-t border-border ${
        isMaximized ? 'fixed inset-0 z-50' : 'h-full'
      }`}
    >
      {/* Terminal header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#252526] border-b border-[#3c3c3c]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#cccccc]">Terminal</span>
          {isConnected && (
            <span className="text-xs text-[#6a9955]">connected</span>
          )}
          {error && (
            <span className="text-xs text-[#f14c4c]">error</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-[#cccccc] hover:text-white hover:bg-[#3c3c3c]"
            onClick={() => setIsMaximized(!isMaximized)}
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? (
              <Minimize2 className="h-3 w-3" />
            ) : (
              <Maximize2 className="h-3 w-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-[#cccccc] hover:text-white hover:bg-[#3c3c3c]"
            onClick={handleClose}
            title="Close"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Terminal container */}
      <div ref={terminalRef} className="flex-1 min-h-0 overflow-hidden p-1 pb-4" />
    </div>
  );
}
