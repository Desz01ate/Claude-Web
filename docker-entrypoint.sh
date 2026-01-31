#!/bin/sh
set -e

# Get target UID/GID (from environment or default to 1000)
TARGET_UID=${LOCAL_UID:-1000}
TARGET_GID=${LOCAL_GID:-1000}

echo "[Entrypoint] Running with UID=$TARGET_UID, GID=$TARGET_GID"

# Find or create group with target GID
TARGET_GROUP=$(getent group "$TARGET_GID" | cut -d: -f1 || true)
if [ -z "$TARGET_GROUP" ]; then
    addgroup -g "$TARGET_GID" appgroup 2>/dev/null || true
    TARGET_GROUP="appgroup"
fi

# Create appuser with target UID if it doesn't exist
if ! getent passwd appuser > /dev/null 2>&1; then
    adduser -u "$TARGET_UID" -G "$TARGET_GROUP" -h /home/appuser -s /bin/bash -D appuser 2>/dev/null || true
fi

# Create home directory structure (don't recursive chown mounted dirs)
mkdir -p /home/appuser/.local/bin
mkdir -p /home/appuser/.claude-web
chown "$TARGET_UID:$TARGET_GID" /home/appuser
chown "$TARGET_UID:$TARGET_GID" /home/appuser/.local 2>/dev/null || true
chown "$TARGET_UID:$TARGET_GID" /home/appuser/.local/bin 2>/dev/null || true
chown "$TARGET_UID:$TARGET_GID" /home/appuser/.claude-web 2>/dev/null || true

# Create symlink for host user's home directory if HOST_USER is set
if [ -n "$HOST_USER" ] && [ "$HOST_USER" != "appuser" ]; then
    HOST_HOME="/home/$HOST_USER"
    mkdir -p "$HOST_HOME"

    # Link .claude from the mounted location
    if [ -d "/home/appuser/.claude" ] || [ -L "/home/appuser/.claude" ]; then
        ln -sf /home/appuser/.claude "$HOST_HOME/.claude"
    fi

    # Link .claude.json config file
    if [ -f "/home/appuser/.claude.json" ]; then
        ln -sf /home/appuser/.claude.json "$HOST_HOME/.claude.json"
    fi


    chown "$TARGET_UID:$TARGET_GID" "$HOST_HOME"
    chown "$TARGET_UID:$TARGET_GID" "$HOST_HOME/.local" 2>/dev/null || true
    chown "$TARGET_UID:$TARGET_GID" "$HOST_HOME/.local/share" 2>/dev/null || true
    echo "[Entrypoint] Created symlinks for $HOST_HOME"
fi

# Fix ownership of app directory (non-recursive for speed)
chown "$TARGET_UID:$TARGET_GID" /app

# Run everything as target UID
echo "[Entrypoint] Starting services..."
exec su-exec "$TARGET_UID:$TARGET_GID" sh -c "HOME=/home/appuser npx next start & HOME=/home/appuser npx tsx server/index.ts"
