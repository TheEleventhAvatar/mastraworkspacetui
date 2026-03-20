# Autonomous Coding Agent

An intelligent coding agent built with Mastra that can take high-level tasks and execute them autonomously.

## Features

- **Multi-Agent Architecture**: Planner → Executor → Verifier → Fixer loop
- **Tool-Based**: File I/O, shell commands, git operations
- **Error Recovery**: Intelligent retry with exponential backoff
- **Context Management**: Only sends relevant files to manage tokens
- **CLI Interface**: Simple terminal interaction with streaming logs

## Architecture

### Agents
1. **Planner Agent**: Breaks tasks into atomic steps
2. **Executor Agent**: Performs individual actions using tools
3. **Verifier Agent**: Checks results against expectations
4. **Fixer Agent**: Handles retries and error recovery

### Tools
- `readFile(path)`: Read file contents
- `writeFile(path, content)`: Write content to file
- `listFiles(dir, recursive)`: List directory contents
- `runCommand(cmd, cwd, timeout)`: Execute shell commands
- `cloneRepo(url, targetDir)`: Clone git repositories

## Usage

```bash
# Install dependencies
bun install

# Run autonomous agent
bun run autonomous "Create a todo list app with React"

# Process GitHub issue
bun run autonomous --issue https://github.com/user/repo/issues/123

# Get help
bun run autonomous --help
```

## Example Execution

```
🤖 Autonomous Coding Agent
Workspace: /home/user/project

🚀 Starting task: Create a todo list app with React
Task ID: task-1712345678901
✓ Created plan with 5 steps

📋 Step 1: Create project directory structure
✓ Step completed successfully

📋 Step 2: Initialize React app
✓ Step completed successfully

📋 Step 3: Create Todo component
✓ Step completed successfully

📋 Step 4: Add styling
⚠️  Step verification failed: Missing CSS imports
🔄 Retrying... (1/2)
✓ Step completed successfully

📋 Step 5: Add tests
✓ Step completed successfully

✅ Task completed successfully!
```

## Configuration

The agent uses OpenAI's GPT-4o model by default. Ensure you have:

```bash
# In apps/server/.env
OPENAI_API_KEY=your_openai_api_key
```

## Development

```bash
# Run in development mode
bun run dev

# Build for production
bun run build

# Test autonomous agent
bun run autonomous "Your test task"
```

## Error Handling

The agent includes robust error handling:
- **Max 2 retries** per step
- **Intelligent fix generation** based on error analysis
- **Context-aware suggestions** for common issues
- **Graceful degradation** when tools fail

## Future Enhancements

- [ ] GitHub issue parsing and extraction
- [ ] Test generation and execution
- [ ] Code review and linting
- [ ] Multi-repository support
- [ ] Web interface
- [ ] Custom tool plugins
