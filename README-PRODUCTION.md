# Production Autonomous Agent

YC Startup Prototype - Real-world autonomous engineering system built with Mastra.

## 🎯 Design Philosophy

Built like a production tool, not a demo:
- **Real execution**: Actual file operations, shell commands, git workflows
- **Clean abstractions**: Modular, testable, extensible architecture  
- **Production logging**: Complete trace logs for debugging and audit
- **Error recovery**: Intelligent retries with root cause analysis
- **Safety limits**: Step limits, dependency tracking, validation

## 🏗️ Architecture

### Core Components
- **ProductionAgent**: Senior engineer with planning, execution, verification, fixing
- **ProductionCoordinator**: Orchestrates workflow with dependency resolution
- **AgentLogger**: Structured logging with trace export
- **GitHubClient**: Issue parsing and repository context
- **DiffEditor**: Patch-based file editing with checksums

### Enhanced Tools v2
- `readFileV2`: Content with checksum verification
- `writeFileV2`: Atomic writes with backup creation
- `editFile`: Diff-based edits (preferred for modifications)
- `listFilesV2`: Directory listing with filtering
- `runCommandV2`: Enhanced shell execution with env vars
- `cloneRepoV2`: Git operations with branch/depth options

## 🚀 Usage

```bash
# Basic task execution
bun run agent "Add authentication to the API"

# High priority task with step limit
bun run agent "Fix failing tests" --priority high --max-steps 10

# GitHub issue processing
bun run agent --issue https://github.com/user/repo/issues/123

# With additional context
bun run agent "Optimize database queries" --context "Production database slowdown"
```

## 📊 Execution Flow

1. **Planning Phase**
   - Parse GitHub issues if provided
   - Create atomic steps with dependencies
   - Estimate time and confidence
   - Enforce step limits for safety

2. **Execution Phase**
   - Dependency resolution before each step
   - Real tool execution with error handling
   - Progress tracking and logging
   - File checksums for integrity

3. **Verification Phase**
   - Result validation against expectations
   - Issue identification and reporting
   - Success/failure determination

4. **Recovery Phase**
   - Root cause analysis for failures
   - Intelligent fix generation
   - Max 2 retries per step
   - Alternative approaches when needed

## 🔧 Real-World Features

### GitHub Integration
```bash
# Automatically parses issue title, body, labels
bun run agent --issue https://github.com/facebook/react/issues/12345

# Extracts requirements and code blocks
# Gets repository context (language, branch)
# Creates targeted fix plans
```

### Diff-Based Editing
```javascript
// Instead of rewriting entire files
const diff = `@@ -10,3 +10,4 @@
 function oldName() {
+function newName() {
   // Existing logic preserved
`;

// Applies precise changes with validation
await editFile({ path: 'src/app.js', diff });
```

### Complete Trace Logging
```json
{
  "timestamp": "2024-03-20T14:30:00.000Z",
  "level": "info",
  "agent": "executor-v2", 
  "stepId": "step-3",
  "message": "Step completed in 1250ms",
  "metadata": {
    "filesChanged": ["src/components/Button.jsx"],
    "checksum": "a1b2c3d4..."
  }
}
```

### Safety Mechanisms
- **Step Limits**: Max 50 steps hard limit
- **Dependency Tracking**: Steps wait for prerequisites
- **Checksum Validation**: File integrity verification
- **Backup Creation**: Automatic backups before edits
- **Timeout Protection**: Command execution timeouts
- **Retry Limits**: Max 2 retries per step

## 📈 Production Metrics

Each execution provides:
- **Success Rate**: Percentage of completed steps
- **Duration**: Total execution time
- **Files Changed**: List of modified files
- **Trace Export**: Complete execution log
- **Error Analysis**: Root cause identification

## 🧪 Example Execution

```bash
$ bun run agent "Add user authentication to Express API"

🚀 Starting Production Autonomous Agent
Workspace: /home/user/project
Task ID: task-1712345678901
Priority: medium
Max Steps: 20

✓ Plan created: 8 steps, 180s estimated

📋 [1/3] Analyze existing authentication structure
✓ Step completed successfully
📊 Progress: 12% (1/8 steps)

📋 [1/3] Create JWT middleware module
✓ Step completed successfully
📊 Progress: 25% (2/8 steps)

📋 [1/3] Add user model with validation
⚠️  Step verification failed
  • Missing password validation
🔄 Creating fix... (1/2)
✓ Step completed successfully
📊 Progress: 37% (3/8 steps)

✅ Task completed! 8 steps executed

📊 Execution Summary:
  Total Steps: 8
  Executed Steps: 8
  Success Rate: 100%
  Duration: 156s
  Files Changed: 4
📝 Trace exported to: agent-trace-task-1712345678901.json
```

## 🛡️ Enterprise Features

### Error Recovery
- **Root Cause Analysis**: Identifies why steps fail
- **Alternative Strategies**: Tries different approaches
- **Context Preservation**: Maintains state across retries
- **Rollback Support**: Backup restoration on failures

### Extensibility
- **Plugin Architecture**: Easy tool addition
- **Agent Swapping**: Replace individual agents
- **Custom Validators**: Add domain-specific verification
- **Workflow Integration**: Embed in existing pipelines

### Production Ready
- **Type Safety**: Full TypeScript with Zod schemas
- **Memory Efficient**: Context pruning and cleanup
- **Observable**: Complete execution tracing
- **Testable**: Modular component design

## 🚦 Getting Started

```bash
# Install dependencies
bun install

# Set up environment
cp apps/server/.env.example apps/server/.env
# Add OPENAI_API_KEY and optionally GITHUB_TOKEN

# Run production agent
bun run agent "Your engineering task"

# View execution traces
cat agent-trace-*.json
```

## 🎯 This is not a demo

This is a production-grade autonomous engineering system:
- **Real file operations** - no simulated execution
- **Actual tool usage** - real shell commands, git operations
- **Professional logging** - structured traces for debugging
- **Enterprise error handling** - comprehensive recovery mechanisms

Built for YC startup speed and production reliability.
