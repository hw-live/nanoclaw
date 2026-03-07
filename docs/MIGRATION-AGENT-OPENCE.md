# Replacing Claude Agent SDK with opencode

## Summary

Successfully replaced the `@anthropic-ai/claude-agent-sdk` with `opencode` as the agent runner for NanoClaw.

## Changes Made

### 1. `/root/src/nanoclaw/container/agent-runner/src/index.ts`

**Removed:**

- All imports from `@anthropic-ai/claude-agent-sdk`
- `query()` function usage with complex options (hooks, MCP servers, etc.)
- `SDKUserMessage` type
- `OpencodeOutputEvent` type (replaced with `any`)
- MCP server integration (`ipc-mcp-stdio.js`)
- Transcript archiving and formatting functions
- Session summary functions

**Added:**

- `spawn()` from `child_process` to run opencode CLI
- JSON event parsing from opencode's `--format json` output
- Direct prompt passing to opencode
- Session ID tracking from opencode's `session` events

**Key Changes:**

- Agent execution now uses `opencode run --format json` command
- Input prompt is written to a temp file and passed via `--file` flag
- Output events are parsed as JSON from stdout
- Session management delegated to opencode (via `--session` flag)
- IPC polling for follow-up messages remains the same

### 2. `/root/src/nanoclaw/container/agent-runner/package.json`

**Removed Dependencies:**

- `@anthropic-ai/claude-agent-sdk` (was ^0.2.34)
- `@modelcontextprotocol/sdk` (was ^1.12.1)
- `cron-parser` (was ^5.0.0)
- `zod` (was ^4.0.0)
- `@types/node` (no longer needed as devDependency)

### 3. `/root/src/nanoclaw/container/agent-runner/src/ipc-mcp-stdio.ts`

**Removed:** This file is no longer needed as it implemented the MCP server for custom tools. With opencode, standard tools are available.

### 4. `/root/src/nanoclaw/container/Dockerfile`

**Changes:**

- Removed Chromium and browser dependencies (not needed for opencode)
- Changed base installation from `agent-browser @anthropic-ai/claude-code` to `opencode-ai`
- Simplified to git, curl, and build-essential only
- Removed image tags with "Claude Agent SDK" comments

## How It Works

### Input

The agent runner still receives the same JSON input via stdin:

```json
{
  "prompt": "Message to agent",
  "sessionId": "optional-session-id",
  "groupFolder": "group-name",
  "chatJid": "chat-id",
  "isMain": true,
  "isScheduledTask": false,
  "assistantName": "Assistant Name",
  "secrets": {
    "ANTHROPIC_API_KEY": "your-key",
    "ANTHROPIC_BASE_URL": "https://api.anthropic.com"
  },
  "model": "optional-model"
}
```

### Agent Execution

The agent runner:

1. Reads stdin JSON
2. Writes prompt to temp file in workspace
3. Runs: `opencode run --format json --title NanoClaw-{group} "{prompt}" --file {prompt-file}`
4. Parses JSON events from stdout
5. Handles session ID tracking, result extraction
6. Polls IPC for follow-up messages

### Output

仍然使用相同的输出格式:

```
---NANOCLAW_OUTPUT_START---
{"status":"success","result":"...", "newSessionId":"..."}
---NANOCLAW_OUTPUT_END---
```

## Requirements

### Environment Variables

- `ANTHROPIC_API_KEY` - Must be provided via `secrets` in input JSON
- `ANTHROPIC_BASE_URL` - Defaults to `https://api.anthropic.com`

### Model Configuration

- Model can be specified in input JSON via `model` field
- Falls back to `ANTHROPIC_MODEL` environment variable
- Default: `anthropic/claude-3-5-sonnet-latest`

## Testing

The container can be tested with:

```bash
echo '{"prompt":"What is 2+2?","groupFolder":"test","chatJid":"test@g.us","isMain":false,"secrets":{"ANTHROPIC_API_KEY":"your-key"}}' | docker run -i nanoclaw-agent:latest
```

## Migration Notes

### Breaking Changes

1. **Model Required**: If no model is specified and `ANTHROPIC_MODEL` is not set, you must provide a model in the input JSON or set the environment variable
2. **No MCP Server**: Custom MCP tools are no longer available. Use opencode's built-in tools
3. **No Transcript Archiving**: Old transcript archiving functions are removed

### Benefits

1. **Simpler Architecture**: No need to manage MCP servers
2. **Smaller Image**: Removed Chromium and Claude dependencies
3. **Native Session Management**: opencode handles sessions internally
4. **Better Tooling**: opencode has its own tool ecosystem

## Files Modified

1. `container/agent-runner/src/index.ts` - Driver implementation
2. `container/agent-runner/package.json` - Dependencies
3. `container/agent-runner/src/ipc-mcp-stdio.ts` - **REMOVED**
4. `container/Dockerfile` - Container build

## Next Steps

1. Test with real API keys
2. Verify all tools work as expected
3. Check session persistence across queries
4. Test IPC follow-up messages
5. Verify \_close sentinel handling
