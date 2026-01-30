# Claude Web Monitor

A web application for monitoring Claude Code sessions, approving permissions, viewing chat history, and auto-setup.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (runs both backend and frontend)
npm run dev
```

Open http://localhost:3000 in your browser.

## Setup

1. Navigate to http://localhost:3000/setup
2. Click "Install Hooks" to configure Claude Code integration
3. Start a new Claude Code session - it will appear in the dashboard

## Architecture

```
┌─────────────────┐    WebSocket    ┌─────────────────┐   Unix Socket    ┌─────────────────┐
│   Next.js SPA   │ ◄────────────► │  Node.js Server  │ ◄──────────────► │  Python Hook    │
│   (Browser)     │    Socket.io    │  (API + WS)      │  /tmp/claude-    │  (Claude Code)  │
└─────────────────┘                 └────────┬─────────┘   web.sock        └─────────────────┘
                                             │
                                             │ File Watch
                                             ▼
                                    ┌─────────────────┐
                                    │  JSONL Files    │
                                    │  ~/.claude/     │
                                    └─────────────────┘
```

## Features

- **Session Dashboard**: View all active Claude Code sessions
- **Real-time Updates**: Sessions update in real-time via WebSocket
- **Permission Approvals**: Approve or deny tool permissions from the web UI
- **Chat History**: View conversation history and tool executions
- **Keyboard Shortcuts**: Y=Allow, N=Deny, A=Ask in terminal

## Project Structure

```
claude-web/
├── src/                    # Next.js frontend
│   ├── app/                # App Router pages
│   ├── components/         # React components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities
│   ├── stores/             # Zustand state stores
│   └── types/              # Shared TypeScript types
│
├── server/                 # Express backend
│   ├── socket/             # Unix socket & WebSocket handlers
│   ├── services/           # Business logic
│   ├── routes/             # REST API routes
│   └── resources/          # Hook script to install
│
└── package.json            # Monorepo package
```

## Scripts

- `npm run dev` - Start both servers in development mode
- `npm run dev:next` - Start only Next.js
- `npm run dev:server` - Start only the backend server

## Ports

- **3000**: Next.js frontend
- **3001**: Express backend API & WebSocket

## How It Works

1. The Python hook script is installed to `~/.claude/hooks/claude-web-state.py`
2. Claude Code triggers hooks on various events (tool use, notifications, etc.)
3. The hook sends events to the server via Unix socket at `/tmp/claude-web.sock`
4. The server broadcasts updates to connected browsers via Socket.io
5. For permission requests, the hook waits for a response before continuing
