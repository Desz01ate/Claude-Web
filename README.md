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

## Docker

Run Claude Web Monitor in a container with full Claude Code integration.

### Prerequisites

Before running in Docker, ensure you have:

1. **Docker & Docker Compose** installed
2. **Claude Code configured on your host** - You must have completed the initial Claude Code setup (login, theme selection) on your host machine first. The container reuses your existing configuration.

Required host files:
- `~/.claude/` - Claude Code configuration directory
- `~/.claude.json` - Onboarding and account state (created after first Claude Code run)

### Quick Start (Docker)

```bash
# Build and run
docker compose up -d

# View logs
docker logs -f claude-web
```

Open http://localhost:3000 in your browser.

### Configuration

Copy `.env.example` to `.env` and configure as needed:

```bash
cp .env.example .env
```

Available environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `WORKSPACE` | Directory to mount as workspace | `./workspace` |
| `ANTHROPIC_API_KEY` | API key (optional if using OAuth) | - |

### Volume Mounts

The `docker-compose.yml` mounts these directories by default:

```yaml
volumes:
  - ${HOME}/.claude:/home/appuser/.claude        # Claude config & hooks
  - ${HOME}/.claude.json:/home/appuser/.claude.json  # Onboarding state
  - ${WORKSPACE:-./workspace}:/workspace         # Your projects
```

Add additional mounts for directories you want Claude to access:

```yaml
volumes:
  # ... existing mounts ...
  - ${HOME}/Projects:/home/appuser/Projects
```

### Accessing the Container

```bash
# Open a shell (as the app user)
docker exec -it -u 1000 claude-web bash

# List tmux sessions
docker exec -it -u 1000 claude-web tmux ls

# Attach to a Claude session
docker exec -it -u 1000 claude-web tmux attach -t <session-name>
```

### Troubleshooting

**Claude asks for login/theme selection:**
- Ensure `~/.claude.json` exists on your host (run `claude` once on the host first)
- Check that the file is mounted: `docker exec claude-web ls -la ~/.claude.json`

**Permission denied errors:**
- The container runs as your host UID (1000 by default)
- Verify with: `docker exec claude-web id`

**tmux sessions not persisting:**
- Ensure you're using the correct user: `docker exec -it -u 1000 claude-web bash`
