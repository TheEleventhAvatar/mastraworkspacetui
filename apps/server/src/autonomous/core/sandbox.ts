import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import * as path from 'path';
import { AgentLogger } from './logger';

const execAsync = promisify(exec);

export interface SandboxConfig {
  maxExecutionTime: number; // in milliseconds
  maxMemoryUsage: number; // in MB
  allowedCommands: string[];
  blockedPaths: string[];
  enableNetworkAccess: boolean;
  tempDirectory: string;
}

export interface SandboxResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
  memoryUsage?: number;
  error?: string;
}

export class ExecutionSandbox {
  private config: SandboxConfig;
  private logger: AgentLogger;
  private activeProcesses = new Map<number, any>();

  constructor(config: Partial<SandboxConfig> = {}, logger: AgentLogger) {
    this.config = {
      maxExecutionTime: 30000, // 30 seconds
      maxMemoryUsage: 512, // 512MB
      allowedCommands: ['ls', 'cat', 'echo', 'mkdir', 'touch', 'grep', 'find', 'git', 'npm', 'node', 'python', 'python3'],
      blockedPaths: ['/etc', '/usr/bin', '/bin', '/sbin', '/sys', '/proc'],
      enableNetworkAccess: false,
      tempDirectory: '/tmp/mastra-sandbox',
      ...config
    };
    this.logger = logger;
  }

  // 🛡️ YC-LEVEL: Secure execution with isolation
  async executeCommand(command: string, cwd?: string): Promise<SandboxResult> {
    const startTime = Date.now();
    const processId = Date.now();
    
    this.logger.info('sandbox', 'execute-start', `Executing: ${command}`, {
      processId,
      cwd: cwd || process.cwd(),
    });

    try {
      // Validate command security
      const validationResult = this.validateCommand(command);
      if (!validationResult.valid) {
        throw new Error(`Command validation failed: ${validationResult.reason}`);
      }

      // Create isolated environment
      const isolatedEnv = await this.createIsolatedEnvironment();
      
      // Execute with timeout and resource limits
      const result = await this.executeWithLimits(command, cwd, isolatedEnv, processId);
      
      const executionTime = Date.now() - startTime;
      result.executionTime = executionTime;

      this.logger.info('sandbox', 'execute-complete', `Command completed in ${executionTime}ms`, {
        processId,
        exitCode: result.exitCode,
        success: result.success,
      });

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.logger.error('sandbox', 'execute-error', `Command failed: ${error}`, {
        processId,
        executionTime,
      });

      return {
        success: false,
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Unknown error',
        exitCode: -1,
        executionTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      // Cleanup
      this.activeProcesses.delete(processId);
      await this.cleanupIsolatedEnvironment(processId);
    }
  }

  private validateCommand(command: string): {valid: boolean, reason?: string} {
    // Check for blocked commands
    const commandParts = command.split(' ');
    const mainCommand = commandParts[0];

    if (!this.config.allowedCommands.includes(mainCommand)) {
      return { valid: false, reason: `Command '${mainCommand}' not allowed` };
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      /rm\s+-rf\s+\//,  // rm -rf /
      /sudo/,           // sudo
      /su\s/,           // su
      /chmod\s+777/,    // chmod 777
      />\s*\/etc/,      // writing to /etc
      /curl.*http/,     // network calls if disabled
      /wget.*http/,     // network calls if disabled
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        return { valid: false, reason: `Dangerous command pattern detected` };
      }
    }

    // Check for blocked paths
    for (const blockedPath of this.config.blockedPaths) {
      if (command.includes(blockedPath)) {
        return { valid: false, reason: `Access to ${blockedPath} not allowed` };
      }
    }

    return { valid: true };
  }

  private async createIsolatedEnvironment(): Promise<string> {
    const sandboxId = Date.now().toString();
    const sandboxPath = path.join(this.config.tempDirectory, `sandbox-${sandboxId}`);

    try {
      // Create sandbox directory
      await fs.mkdir(sandboxPath, { recursive: true });
      
      // Create minimal filesystem structure
      await fs.mkdir(path.join(sandboxPath, 'tmp'), { recursive: true });
      await fs.mkdir(path.join(sandboxPath, 'home'), { recursive: true });

      this.logger.info('sandbox', 'env-created', `Isolated environment created: ${sandboxPath}`);
      
      return sandboxPath;
    } catch (error) {
      this.logger.error('sandbox', 'env-create-error', `Failed to create isolated environment: ${error}`);
      throw error;
    }
  }

  private async executeWithLimits(
    command: string, 
    cwd: string | undefined, 
    sandboxPath: string,
    processId: number
  ): Promise<SandboxResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      // Set resource limits using ulimit
      const limitScript = `
        ulimit -t ${Math.floor(this.config.maxExecutionTime / 1000)}  # CPU time limit
        ulimit -v ${this.config.maxMemoryUsage * 1024}                # Memory limit
        ulimit -f 1024                                                # File size limit
        ${command}
      `;

      const child = exec(limitScript, {
        cwd: cwd || process.cwd(),
        env: {
          ...process.env,
          HOME: path.join(sandboxPath, 'home'),
          TMPDIR: path.join(sandboxPath, 'tmp'),
          PATH: '/usr/local/bin:/usr/bin:/bin', // Restricted PATH
        },
        shell: '/bin/bash',
      });

      this.activeProcesses.set(processId, child);

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Set timeout
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        resolve({
          success: false,
          stdout: stdout.trim(),
          stderr: stderr.trim() || 'Command timed out',
          exitCode: -1,
          executionTime: this.config.maxExecutionTime,
          error: 'Command execution timeout',
        });
      }, this.config.maxExecutionTime);

      child.on('close', (code) => {
        clearTimeout(timeout);
        const executionTime = Date.now() - startTime;
        
        resolve({
          success: code === 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code || 0,
          executionTime,
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        const executionTime = Date.now() - startTime;
        
        resolve({
          success: false,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: -1,
          executionTime,
          error: error.message,
        });
      });
    });
  }

  private async cleanupIsolatedEnvironment(processId: number): Promise<void> {
    const sandboxId = processId.toString();
    const sandboxPath = path.join(this.config.tempDirectory, `sandbox-${sandboxId}`);

    try {
      // Kill any remaining processes
      const child = this.activeProcesses.get(processId);
      if (child && !child.killed) {
        child.kill('SIGKILL');
      }

      // Remove sandbox directory
      await fs.rm(sandboxPath, { recursive: true, force: true });
      
      this.logger.info('sandbox', 'env-cleanup', `Isolated environment cleaned up: ${sandboxPath}`);
    } catch (error) {
      this.logger.error('sandbox', 'env-cleanup-error', `Failed to cleanup environment: ${error}`);
    }
  }

  // 🔄 YC-LEVEL: Emergency cleanup
  async emergencyCleanup(): Promise<void> {
    this.logger.warn('sandbox', 'emergency-cleanup', 'Starting emergency cleanup');

    // Kill all active processes
    for (const [processId, child] of Array.from(this.activeProcesses)) {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }
    this.activeProcesses.clear();

    // Remove all sandbox directories
    try {
      const tempDirs = await fs.readdir(this.config.tempDirectory);
      for (const dir of tempDirs) {
        if (dir.startsWith('sandbox-')) {
          const sandboxPath = path.join(this.config.tempDirectory, dir);
          await fs.rm(sandboxPath, { recursive: true, force: true });
        }
      }
    } catch (error) {
      this.logger.error('sandbox', 'emergency-cleanup-error', `Emergency cleanup failed: ${error}`);
    }

    this.logger.info('sandbox', 'emergency-cleanup-complete', 'Emergency cleanup completed');
  }

  // 📊 YC-LEVEL: Resource monitoring
  async getResourceUsage(): Promise<{
    activeProcesses: number;
    totalMemoryUsage: number;
    sandboxDirectories: number;
  }> {
    try {
      const tempDirs = await fs.readdir(this.config.tempDirectory);
      const sandboxCount = tempDirs.filter(dir => dir.startsWith('sandbox-')).length;

      return {
        activeProcesses: this.activeProcesses.size,
        totalMemoryUsage: this.activeProcesses.size * this.config.maxMemoryUsage,
        sandboxDirectories: sandboxCount,
      };
    } catch (error) {
      return {
        activeProcesses: this.activeProcesses.size,
        totalMemoryUsage: 0,
        sandboxDirectories: 0,
      };
    }
  }

  // ⚙️ YC-LEVEL: Configuration management
  updateConfig(newConfig: Partial<SandboxConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('sandbox', 'config-updated', 'Sandbox configuration updated');
  }

  getConfig(): SandboxConfig {
    return { ...this.config };
  }

  // 🔒 YC-LEVEL: Security audit
  async auditSecurity(): Promise<{
    passed: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check if temp directory is secure
    try {
      const tempStats = await fs.stat(this.config.tempDirectory);
      if (tempStats.mode.toString(8).slice(-3) !== '700') {
        issues.push('Temp directory permissions are too permissive');
        recommendations.push('Set temp directory permissions to 700');
      }
    } catch (error) {
      issues.push('Cannot access temp directory');
      recommendations.push('Ensure temp directory exists and is accessible');
    }

    // Check command whitelist
    if (this.config.allowedCommands.includes('sudo')) {
      issues.push('Dangerous command allowed: sudo');
      recommendations.push('Remove sudo from allowed commands');
    }

    // Check resource limits
    if (this.config.maxMemoryUsage > 1024) {
      recommendations.push('Consider reducing memory limit for better security');
    }

    if (this.config.maxExecutionTime > 60000) {
      recommendations.push('Consider reducing execution timeout for better security');
    }

    return {
      passed: issues.length === 0,
      issues,
      recommendations,
    };
  }
}
