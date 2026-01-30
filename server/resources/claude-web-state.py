#!/usr/bin/env python3
"""
Claude Web Hook
- Sends session state to claude-web server via Unix socket
- For PermissionRequest: waits for user decision from the web app
"""
import json
import os
import socket
import sys

SOCKET_PATH = "/tmp/claude-web.sock"
TIMEOUT_SECONDS = 300  # 5 minutes for permission decisions


def get_tty():
    """Get the TTY of the Claude process (parent)"""
    import subprocess

    # Get parent PID (Claude process)
    ppid = os.getppid()

    # Try to get TTY from ps command for the parent process
    try:
        result = subprocess.run(
            ["ps", "-p", str(ppid), "-o", "tty="],
            capture_output=True,
            text=True,
            timeout=2
        )
        tty = result.stdout.strip()
        if tty and tty != "??" and tty != "-":
            # ps returns just "pts/1", we need "/dev/pts/1"
            if not tty.startswith("/dev/"):
                tty = "/dev/" + tty
            return tty
    except Exception:
        pass

    # Fallback: try current process stdin/stdout
    try:
        return os.ttyname(sys.stdin.fileno())
    except (OSError, AttributeError):
        pass
    try:
        return os.ttyname(sys.stdout.fileno())
    except (OSError, AttributeError):
        pass
    return None


def send_event(event_data):
    """Send event to server, return response if any"""
    try:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(TIMEOUT_SECONDS)
        sock.connect(SOCKET_PATH)
        sock.sendall((json.dumps(event_data) + "\n").encode())

        # For permission requests, wait for response
        if event_data.get("event_type") == "waiting_for_approval":
            response = sock.recv(4096)
            sock.close()
            if response:
                return json.loads(response.decode())
        else:
            sock.close()

        return None
    except (socket.error, OSError, json.JSONDecodeError):
        return None


def main():
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(1)

    session_id = data.get("session_id", "unknown")
    event = data.get("hook_event_name", "")
    cwd = data.get("cwd", "")
    tool_input = data.get("tool_input", {})

    # Get process info
    claude_pid = os.getppid()
    tty = get_tty()

    # Build event object for the server
    event_data = {
        "session_id": session_id,
        "cwd": cwd,
        "pid": claude_pid,
        "tty": tty,
    }

    # Map Claude hook events to our event types
    if event == "UserPromptSubmit":
        # User just sent a message - Claude is now processing
        event_data["event_type"] = "processing"

    elif event == "PreToolUse":
        event_data["event_type"] = "running_tool"
        event_data["tool_name"] = data.get("tool_name")
        event_data["tool_input"] = tool_input
        # Send tool_use_id for caching
        tool_use_id = data.get("tool_use_id")
        if tool_use_id:
            event_data["tool_use_id"] = tool_use_id

    elif event == "PostToolUse":
        event_data["event_type"] = "processing"
        event_data["tool_name"] = data.get("tool_name")
        event_data["tool_input"] = tool_input
        tool_use_id = data.get("tool_use_id")
        if tool_use_id:
            event_data["tool_use_id"] = tool_use_id

    elif event == "PermissionRequest":
        # This is where we can control the permission
        event_data["event_type"] = "waiting_for_approval"
        event_data["tool_name"] = data.get("tool_name")
        event_data["tool_input"] = tool_input

        # Send to server and wait for decision
        response = send_event(event_data)

        if response:
            decision = response.get("decision", "ask")
            reason = response.get("reason", "")

            if decision == "allow":
                # Output JSON to approve
                output = {
                    "hookSpecificOutput": {
                        "hookEventName": "PermissionRequest",
                        "decision": {"behavior": "allow"},
                    }
                }
                print(json.dumps(output))
                sys.exit(0)

            elif decision == "deny":
                # Output JSON to deny
                output = {
                    "hookSpecificOutput": {
                        "hookEventName": "PermissionRequest",
                        "decision": {
                            "behavior": "deny",
                            "message": reason or "Denied by user via Claude Web Monitor",
                        },
                    }
                }
                print(json.dumps(output))
                sys.exit(0)

        # No response or "ask" - let Claude Code show its normal UI
        sys.exit(0)

    elif event == "Notification":
        notification_type = data.get("notification_type")
        # Skip permission_prompt - PermissionRequest hook handles this with better info
        if notification_type == "permission_prompt":
            sys.exit(0)
        elif notification_type == "idle_prompt":
            event_data["event_type"] = "waiting_for_input"
        else:
            event_data["event_type"] = "notification"
        event_data["title"] = notification_type
        event_data["message"] = data.get("message")

    elif event == "Stop":
        event_data["event_type"] = "waiting_for_input"

    elif event == "SubagentStop":
        # SubagentStop fires when a subagent completes - usually means back to waiting
        event_data["event_type"] = "waiting_for_input"

    elif event == "SessionStart":
        # New session starts waiting for user input
        event_data["event_type"] = "session_start"

    elif event == "SessionEnd":
        event_data["event_type"] = "session_end"

    elif event == "PreCompact":
        # Context is being compacted (manual or auto)
        event_data["event_type"] = "compacting"

    else:
        event_data["event_type"] = "notification"
        event_data["message"] = f"Unknown event: {event}"

    # Send to socket (fire and forget for non-permission events)
    send_event(event_data)


if __name__ == "__main__":
    main()
