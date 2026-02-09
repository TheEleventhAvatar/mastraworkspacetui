# mastra-tui

A terminal-based AI coding agent powered by [Mastra](https://mastra.ai). Chat with an AI assistant that can clone repos, explore codebases, read/write files, and execute shell commands -- all from your terminal.

## Architecture

Turborepo monorepo with two apps:

- **`apps/server`** -- Mastra dev server (port 4111) hosting a sandboxed coding agent with filesystem and shell access
- **`apps/terminal`** -- Ink (React for CLIs) chat interface with real-time streaming, tool call visualization, and reasoning display

```
Terminal (Ink/React TUI)
        |
        | HTTP stream (localhost:4111)
        v
Mastra Server
  ├── Coding Agent (Gemini 3 Flash via OpenRouter)
  └── Workspace (LocalSandbox: file I/O + shell exec)
```

## Tech Stack

- **AI**: Mastra framework, Google Gemini 3 Flash Preview (via OpenRouter)
- **Server**: `@mastra/core`, `@mastra/libsql` (SQLite storage), `@mastra/loggers`
- **Terminal**: Ink 5, React 18, tsup
- **Monorepo**: Turborepo, Bun

## Setup

```bash
# Install dependencies
bun install

# Configure environment
cp apps/server/.env.example apps/server/.env
# Add your OpenRouter API key to apps/server/.env
```

## Usage

```bash
# Start both server and terminal
bun run dev

# Or start individually
bun run dev:server     # Mastra server on port 4111
bun run dev:terminal   # TUI client (needs server running)
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | [OpenRouter](https://openrouter.ai) API key |

## Agent Capabilities

The coding agent runs in a sandboxed workspace (`apps/server/workspace/`) and can:

- Clone git repositories
- Explore directory structures
- Read and write files
- Execute shell commands
- Generate codebase summaries
