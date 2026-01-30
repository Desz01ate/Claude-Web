# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Web Monitor is a web application for monitoring and controlling Claude Code sessions through a browser interface. It provides real-time session management, permission approvals, chat history viewing, and automatic setup capabilities.

### Tech Stack
- **Frontend**: Next.js 14 (App Router) + TypeScript + React 18 + Tailwind CSS
- **Backend**: Express.js + TypeScript + Socket.IO
- **Database**: SQLite (better-sqlite3) for session persistence
- **Session Management**: tmux integration for session lifecycle control
- **Real-time**: Unix socket (Python hook → Node.js) + WebSocket (Node.js → Browser)

## Development Commands

```bash
# Start both frontend (port 3000) and backend (port 3001) in development
npm run dev

# Start only Next.js frontend
npm run dev:next

# Start only Express backend
npm run dev:server

# Build for production
npm run build

# Start production servers
npm start

# Lint
npm run lint
```

## Architecture

```
┌─────────────────┐    WebSocket    ┌─────────────────┐   Unix Socket    ┌─────────────────┐
│   Next.js SPA   │ ◄────────────► │  Node.js Server  │ ◄──────────────► │  Python Hook    │
│   (Browser)     │    Socket.io    │  (API + WS)      │   /tmp/claude-    │  (Claude Code)  │
└─────────────────┘                 └────────┬─────────┘   web.sock        └─────────────────┘
                                             │
                                             │ File Watch
                                             ▼
                                    ┌─────────────────┐
                                    │  JSONL Files    │
                                    │  ~/.claude/     │
                                    └─────────────────┘
```

### Communication Flow

1. **Claude Code → Python Hook**: Claude triggers hooks on events (tool use, permissions, session lifecycle)
2. **Python Hook → Node.js**: Events sent via Unix socket (`/tmp/claude-web.sock`)
3. **Node.js → Browser**: Updates broadcast via Socket.IO WebSocket
4. **Permission Flow**: Hook keeps socket open and waits for web UI response before continuing

### Session Types

- **Managed Sessions**: Created/resumed via web UI with full lifecycle control (tmux-managed)
- **External Sessions**: Existing Claude sessions detected through file watching (view-only)

## Key Services

| Service | File | Responsibility |
|---------|------|-----------------|
| **SessionStore** | `server/services/SessionStore.ts` | Central session state, event processing, chat history parsing, permission handling |
| **TmuxSessionManager** | `server/services/TmuxSessionManager.ts` | tmux session lifecycle, creation/resumption/cleanup |
| **HookSocketServer** | `server/socket/hookSocket.ts` | Unix socket server for Python hook communication |
| **WebSocketServer** | `server/socket/webSocket.ts` | Socket.IO server for browser clients |
| **ConversationParser** | `server/services/ConversationParser.ts` | Parses Claude conversation JSONL files into ChatHistoryItem format |
| **HookInstaller** | `server/services/HookInstaller.ts` | Manages Claude hook installation and `~/.claude/settings.json` config |

## Session States

Sessions progress through these states: `idle` → `processing` → `waitingForInput` | `waitingForApproval` → `compacting` → `ended`

## File Locations

- **Conversations**: `~/.claude/projects/{project-dir}/{session-id}.jsonl`
- **Hook script**: `~/.claude/hooks/claude-web-state.py`
- **Session database**: SQLite managed by SessionDatabase service
- **Unix socket**: `/tmp/claude-web.sock`

## Frontend Structure

- `src/app/` - Next.js App Router pages (`/`, `/sessions/[id]`, `/setup`)
- `src/components/chat/` - Chat UI components (messages, tool calls, permission cards)
- `src/components/sessions/` - Session list and management UI
- `src/components/permissions/` - Permission approval UI
- `src/stores/` - Zustand stores for session/chat/permission state
- `src/hooks/` - `useSession` and `useWebSocket` custom hooks

## Important Patterns

1. **Event-Driven**: All Claude events are normalized and trigger state changes + broadcasts
2. **Permission Blocking**: Hook waits synchronously for web UI response before returning to Claude
3. **Session Correlation**: Managed sessions use working directory + timing to correlate tmux sessions with Claude sessions
4. **Shared Types**: `src/types/index.ts` defines interfaces used across frontend/backend
5. **Optimistic UI**: Client state updates before server confirmation

## Setup Flow

First-time users must navigate to `/setup` to install hooks, which configures `~/.claude/settings.json` and deploys the Python hook script.
