import { createTool } from '@mastra/core/tools';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { z } from 'zod';
import { DiffEditor } from './diff';
import { 
  ProjectIndex, 
  ProjectFile, 
  DependencyAnalysis, 
  CodebaseSearchResult,
  SearchMatch,
  ImportDependency 
} from './types';
import { ExecutionSandbox } from './sandbox';
import { OptimizationManager } from './optimization';
import { ReliableCodeEditor, EditOperation } from './reliable-editor';

const execAsync = promisify(exec);

export const readFileV2Tool = createTool({
  id: 'readFileV2',
  description: 'Read file contents with checksum verification',
  inputSchema: z.object({
    path: z.string().describe('File path to read'),
    checksum: z.string().optional().describe('Expected checksum for verification'),
  }),
  execute: async ({ path, checksum }) => {
    try {
      const content = await fs.readFile(path, 'utf-8');
      const actualChecksum = DiffEditor.getFileChecksum(content);
      
      if (checksum && checksum !== actualChecksum) {
        return { 
          success: false, 
          error: `Checksum mismatch: expected ${checksum}, got ${actualChecksum}`,
          content,
          actualChecksum,
        };
      }
      
      return { 
        success: true, 
        content,
        checksum: actualChecksum,
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

export const writeFileV2Tool = createTool({
  id: 'writeFileV2',
  description: 'Write content to file with backup and checksum',
  inputSchema: z.object({
    filePath: z.string().describe('File path to write'),
    content: z.string().describe('Content to write'),
    backup: z.boolean().default(true).describe('Create backup of existing file'),
  }),
  execute: async ({ filePath, content, backup }) => {
    try {
      // Create backup if file exists
      if (backup) {
        try {
          const existingContent = await fs.readFile(filePath, 'utf-8');
          const backupPath = `${filePath}.backup.${Date.now()}`;
          await fs.writeFile(backupPath, existingContent, 'utf-8');
        } catch {
          // File doesn't exist, no backup needed
        }
      }

      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
      const checksum = DiffEditor.getFileChecksum(content);
      
      return { 
        success: true, 
        checksum,
        size: Buffer.byteLength(content, 'utf-8'),
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

export const editFileTool = createTool({
  id: 'editFile',
  description: 'Apply diff-based edits to file',
  inputSchema: z.object({
    path: z.string().describe('File path to edit'),
    diff: z.string().describe('Unified diff to apply'),
    expectedChecksum: z.string().optional().describe('Expected current file checksum'),
  }),
  execute: async ({ path, diff, expectedChecksum }) => {
    try {
      // Validate diff format
      const validation = DiffEditor.validateDiff(diff);
      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid diff: ${validation.error}`,
        };
      }

      // Check current file checksum if provided
      if (expectedChecksum) {
        const currentContent = await fs.readFile(path, 'utf-8');
        const currentChecksum = DiffEditor.getFileChecksum(currentContent);
        if (currentChecksum !== expectedChecksum) {
          return {
            success: false,
            error: `File checksum mismatch: expected ${expectedChecksum}, got ${currentChecksum}`,
          };
        }
      }

      const result = await DiffEditor.applyDiff(path, diff);
      
      if (result.success) {
        const newChecksum = DiffEditor.getFileChecksum(result.newContent);
        return {
          success: true,
          newContent: result.newContent,
          newChecksum,
          changesApplied: true,
        };
      }
      
      return result;
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

export const listFilesV2Tool = createTool({
  id: 'listFilesV2',
  description: 'List files with metadata and filtering',
  inputSchema: z.object({
    path: z.string().describe('Directory path to list'),
    recursive: z.boolean().default(false).describe('List recursively'),
    pattern: z.string().optional().describe('File pattern filter (glob)'),
    includeHidden: z.boolean().default(false).describe('Include hidden files'),
  }),
  execute: async ({ path: directoryPath, recursive, pattern, includeHidden }) => {
    try {
      const listDir = async (dir: string, prefix = ''): Promise<Array<{
        name: string;
        path: string;
        type: 'file' | 'directory';
        size: number;
        modified: string;
      }>> => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const files: any[] = [];
        
        for (const entry of entries) {
          if (!includeHidden && entry.name.startsWith('.')) {
            continue;
          }
          
          if (pattern && !entry.name.match(pattern)) {
            continue;
          }
          
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.join(prefix, entry.name);
          const stats = await fs.stat(fullPath);
          
          const fileInfo = {
            name: entry.name,
            path: relativePath,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            modified: stats.mtime.toISOString(),
          };
          
          if (entry.isDirectory() && recursive) {
            const subFiles = await listDir(fullPath, relativePath);
            files.push(...subFiles);
          } else {
            files.push(fileInfo);
          }
        }
        return files;
      };
      
      const files = await listDir(directoryPath);
      return { 
        success: true, 
        files,
        count: files.length,
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

export const runCommandV2Tool = createTool({
  id: 'runCommandV2',
  description: 'Execute shell command with secure sandbox isolation',
  inputSchema: z.object({
    command: z.string().describe('Command to execute'),
    cwd: z.string().optional().describe('Working directory'),
    timeout: z.number().default(30000).describe('Timeout in milliseconds'),
    env: z.record(z.string()).optional().describe('Environment variables'),
    shell: z.boolean().default(true).describe('Use shell execution'),
    enableSandbox: z.boolean().default(true).describe('Use secure sandbox execution'),
  }),
  execute: async ({ command, cwd, timeout, env, shell, enableSandbox }) => {
    try {
      const startTime = Date.now();
      
      if (enableSandbox) {
        // 🛡️ YC-LEVEL: Secure sandbox execution
        // Note: Using a simple logger fallback since we don't have AgentLogger here
        const simpleLogger = {
          info: (category: string, action: string, message: string, data?: any) => {
            console.log(`[${category}] ${action}: ${message}`, data || '');
          },
          error: (category: string, action: string, message: string, data?: any) => {
            console.error(`[${category}] ${action}: ${message}`, data || '');
          },
          warn: (category: string, action: string, message: string, data?: any) => {
            console.warn(`[${category}] ${action}: ${message}`, data || '');
          }
        };
        
        const sandbox = new ExecutionSandbox({
          maxExecutionTime: timeout,
          allowedCommands: ['ls', 'cat', 'echo', 'mkdir', 'touch', 'grep', 'find', 'git', 'npm', 'node', 'python', 'python3', 'npx', 'yarn', 'pnpm'],
          enableNetworkAccess: false,
        }, simpleLogger as any);
        
        const result = await sandbox.executeCommand(command, cwd);
        const duration = Date.now() - startTime;
        
        return {
          success: result.success,
          stdout: result.stdout,
          stderr: result.stderr,
          duration,
          exitCode: result.exitCode,
          sandboxUsed: true,
          memoryUsage: result.memoryUsage,
        };
      } else {
        // Legacy execution (less secure)
        const execOptions: any = {
          cwd: cwd || process.cwd(),
          timeout,
          shell,
          env: { ...process.env, ...env },
        };

        const { stdout, stderr } = await execAsync(command, execOptions);
        const duration = Date.now() - startTime;
        
        return { 
          success: true, 
          stdout: stdout.toString().trim(),
          stderr: stderr.toString().trim(),
          duration,
          exitCode: 0,
          sandboxUsed: false,
        };
      }
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.code || 1,
        duration: 0,
        sandboxUsed: true,
      };
    }
  },
});

// 🛡️ OPTIMIZED RELIABLE EDIT TOOL
export const reliableEditTool = createTool({
  id: 'reliableEdit',
  description: 'Perform reliable code edits with validation and rollback',
  inputSchema: z.object({
    filePath: z.string().describe('File path to edit'),
    operation: z.enum(['insert', 'delete', 'replace', 'move']).describe('Edit operation type'),
    line: z.number().describe('Line number (1-based)'),
    column: z.number().default(0).describe('Column number (0-based)'),
    content: z.string().optional().describe('Content to insert/replace'),
    deleteLength: z.number().optional().describe('Number of characters to delete'),
    targetLine: z.number().optional().describe('Target line for move operations'),
    targetColumn: z.number().optional().describe('Target column for move operations'),
    validateSyntax: z.boolean().default(true).describe('Validate syntax after edit'),
    createBackup: z.boolean().default(true).describe('Create backup before edit'),
  }),
  execute: async ({ filePath, operation, line, column, content, deleteLength, targetLine, targetColumn, validateSyntax, createBackup }) => {
    const startTime = Date.now();
    
    try {
      const editor = new ReliableCodeEditor();
      const optimizer = new OptimizationManager();

      // Create edit operation
      const editOperation: EditOperation = {
        type: operation,
        filePath,
        position: { line, column, deleteLength },
        content,
        targetPosition: targetLine ? { line: targetLine, column: targetColumn } : undefined,
      };

      // Perform reliable edit
      const result = await editor.performEdit(editOperation);

      if (!result.success) {
        return {
          success: false,
          error: result.error,
          operation: editOperation,
          validationResult: result.validationResult,
          duration: Date.now() - startTime,
        };
      }

      // Validate syntax if requested
      if (validateSyntax) {
        const syntaxValidation = await editor.validateFile(filePath);
        if (!syntaxValidation.syntaxValid) {
          // Rollback on syntax error
          await editor.rollbackEdit(filePath);
          return {
            success: false,
            error: `Syntax validation failed: ${syntaxValidation.errors.join(', ')}`,
            operation: editOperation,
            validationResult: syntaxValidation,
            rolledBack: true,
            duration: Date.now() - startTime,
          };
        }
      }

      // Track token usage (estimated)
      const tokenUsage = optimizer.trackTokenUsage(50, 30); // Rough estimate

      return {
        success: true,
        operation: editOperation,
        validationResult: result.validationResult,
        backupPath: result.backupPath,
        tokenUsage,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      };
    }
  },
});

export const cloneRepoV2Tool = createTool({
  id: 'cloneRepoV2',
  description: 'Clone repository with depth and branch options',
  inputSchema: z.object({
    url: z.string().describe('Repository URL'),
    targetDir: z.string().describe('Target directory'),
    branch: z.string().optional().describe('Specific branch to clone'),
    depth: z.number().optional().describe('Clone depth (shallow clone)'),
  }),
  execute: async ({ url, targetDir, branch, depth }) => {
    try {
      await fs.mkdir(targetDir, { recursive: true });
      
      let command = `git clone ${url} ${targetDir}`;
      if (branch) {
        command += ` --branch ${branch}`;
      }
      if (depth) {
        command += ` --depth ${depth}`;
      }
      
      const { stdout, stderr } = await execAsync(command);
      
      return { 
        success: true, 
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        targetDir,
        cloned: true,
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        stdout: (error as any)?.stdout || '',
        stderr: (error as any)?.stderr || '',
      };
    }
  },
});

// Project Indexing Tool
export const indexProjectTool = createTool({
  id: 'indexProject',
  description: 'Scan and index all files in the project directory',
  inputSchema: z.object({
    rootPath: z.string().optional().describe('Root path to index (default: current working directory)'),
    includePatterns: z.array(z.string()).optional().describe('File patterns to include'),
    excludePatterns: z.array(z.string()).optional().describe('File patterns to exclude'),
    maxDepth: z.number().optional().describe('Maximum directory depth to scan'),
  }),
  execute: async ({ rootPath = process.cwd(), includePatterns = ['**/*'], excludePatterns = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'], maxDepth = 10 }) => {
    try {
      const startTime = Date.now();
      const files: ProjectFile[] = [];
      const directories = new Set<string>();

      const scanDirectory = async (dirPath: string, currentDepth: number): Promise<void> => {
        if (currentDepth > maxDepth) return;

        try {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            const relativePath = path.relative(rootPath, fullPath);

            // Skip excluded patterns
            const shouldExclude = excludePatterns.some(pattern => {
              const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
              return regex.test(relativePath);
            });
            
            if (shouldExclude) continue;

            if (entry.isDirectory()) {
              directories.add(relativePath);
              await scanDirectory(fullPath, currentDepth + 1);
            } else if (entry.isFile()) {
              const stats = await fs.stat(fullPath);
              const extension = path.extname(fullPath);
              const language = getLanguageFromExtension(extension);
              
              files.push({
                path: relativePath,
                type: 'file',
                size: stats.size,
                extension,
                language,
                lastModified: stats.mtime.toISOString(),
              });
            }
          }
        } catch (error) {
          // Skip directories we can't read
        }
      }

      await scanDirectory(rootPath, 0);

      const index: ProjectIndex = {
        files: files.sort((a, b) => a.path.localeCompare(b.path)),
        directories: Array.from(directories).sort(),
        totalFiles: files.length,
        indexedAt: new Date().toISOString(),
      };

      return {
        success: true,
        index,
        scanTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

// Dependency Analysis Tool
export const analyzeDependenciesTool = createTool({
  id: 'analyzeDependencies',
  description: 'Analyze project dependencies from package.json and import statements',
  inputSchema: z.object({
    rootPath: z.string().optional().describe('Root path to analyze (default: current working directory)'),
    includeDevDependencies: z.boolean().default(true).describe('Include dev dependencies in analysis'),
  }),
  execute: async ({ rootPath = process.cwd(), includeDevDependencies = true }) => {
    try {
      const startTime = Date.now();
      const analysis: DependencyAnalysis = {
        imports: [],
        dependencies: { nodes: [], edges: [] },
      };

      // Parse package.json if it exists
      const packageJsonPath = path.join(rootPath, 'package.json');
      try {
        const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonContent);
        
        analysis.packageJson = {
          dependencies: packageJson.dependencies || {},
          devDependencies: packageJson.devDependencies || {},
          peerDependencies: packageJson.peerDependencies || {},
          scripts: packageJson.scripts || {},
        };

        if (includeDevDependencies) {
          analysis.devDependencies = packageJson.devDependencies;
        }
      } catch (error) {
        // No package.json found
      }

      // Scan for import statements in source files
      const sourceFiles = analysis.packageJson ? 
        Object.keys(analysis.packageJson.dependencies) : [];

      const filesToScan = [];
      for (const file of await fs.readdir(rootPath, { withFileTypes: true })) {
        if (file.isFile() && /\.(js|ts|jsx|tsx)$/.test(file.name)) {
          filesToScan.push(path.join(rootPath, file.name));
        }
      }

      for (const filePath of filesToScan) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const imports = extractImports(content, filePath);
          analysis.imports.push(...imports);
        } catch (error) {
          // Skip files that can't be read
        }
      }

      return {
        success: true,
        analysis,
        analysisTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

// Codebase Search Tool
export const searchCodebaseTool = createTool({
  id: 'searchCodebase',
  description: 'Search across the entire codebase for patterns and text',
  inputSchema: z.object({
    query: z.string().describe('Search query or regex pattern'),
    rootPath: z.string().optional().describe('Root path to search (default: current working directory)'),
    filePattern: z.string().optional().describe('File pattern to limit search (e.g., "**/*.ts")'),
    caseSensitive: z.boolean().default(false).describe('Case sensitive search'),
    maxResults: z.number().default(50).describe('Maximum number of results to return'),
    contextLines: z.number().default(2).describe('Number of context lines before and after matches'),
  }),
  execute: async ({ query, rootPath = process.cwd(), filePattern, caseSensitive = false, maxResults = 50, contextLines = 2 }) => {
    try {
      const startTime = Date.now();
      const matches: SearchMatch[] = [];
      
      // Use ripgrep if available, otherwise fallback to basic search
      try {
        const rgArgs = [
          caseSensitive ? '' : '-i',
          '--json',
          '--line-number',
          '--column-number',
          `--context=${contextLines}`,
          `--max-count=${maxResults}`,
          query,
          rootPath,
        ].filter(Boolean);

        if (filePattern) {
          rgArgs.splice(-1, 0, '--glob', filePattern);
        }

        const { stdout } = await execAsync(`rg ${rgArgs.join(' ')}`);
        const lines = stdout.trim().split('\n');
        
        for (const line of lines) {
          if (line) {
            try {
              const data = JSON.parse(line);
              if (data.type === 'match') {
                matches.push({
                  file: path.relative(rootPath, data.path),
                  line: data.line_number,
                  column: data.column_number,
                  content: data.lines.text,
                  context: data.lines.context || [],
                });
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      } catch (error) {
        // Fallback to basic file search if ripgrep not available
        await basicFileSearch(rootPath, query, matches, filePattern, caseSensitive, maxResults);
      }

      const result: CodebaseSearchResult = {
        matches: matches.slice(0, maxResults),
        totalMatches: matches.length,
        searchTime: Date.now() - startTime,
      };

      return {
        success: true,
        result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

// Helper functions
function getLanguageFromExtension(extension: string): string | undefined {
  const languageMap: Record<string, string> = {
    '.js': 'JavaScript',
    '.ts': 'TypeScript',
    '.jsx': 'JavaScript',
    '.tsx': 'TypeScript',
    '.py': 'Python',
    '.java': 'Java',
    '.cpp': 'C++',
    '.c': 'C',
    '.cs': 'C#',
    '.go': 'Go',
    '.rs': 'Rust',
    '.php': 'PHP',
    '.rb': 'Ruby',
    '.swift': 'Swift',
    '.kt': 'Kotlin',
    '.scala': 'Scala',
    '.sh': 'Shell',
    '.json': 'JSON',
    '.yaml': 'YAML',
    '.yml': 'YAML',
    '.xml': 'XML',
    '.html': 'HTML',
    '.css': 'CSS',
    '.scss': 'SCSS',
    '.sass': 'Sass',
    '.less': 'LESS',
    '.md': 'Markdown',
    '.sql': 'SQL',
    '.dockerfile': 'Docker',
  };
  return languageMap[extension.toLowerCase()];
}

function extractImports(content: string, filePath: string): ImportDependency[] {
  const imports: ImportDependency[] = [];
  const lines = content.split('\n');
  
  // Regex patterns for different import types
  const patterns = [
    // ES6 imports
    /import\s+(?:(?:\*\s+as\s+\w+)|(?:\w+)|(?:\{[^}]+\}))\s+from\s+['"`]([^'"`]+)['"`]/g,
    // CommonJS require
    /(?:const|let|var)\s+(?:(?:\*\s+as\s+\w+)|(?:\w+)|(?:\{[^}]+\}))\s*=\s*require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    // Dynamic imports
    /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  ];

  for (const line of lines) {
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const importPath = match[1];
        imports.push({
          file: filePath,
          imports: [importPath],
          fromLocal: importPath.startsWith('./') || importPath.startsWith('../'),
          fromPackage: !importPath.startsWith('./') && !importPath.startsWith('../') && !importPath.startsWith('/'),
        });
      }
    }
  }

  return imports;
}

async function basicFileSearch(rootPath: string, query: string, matches: SearchMatch[], filePattern?: string, caseSensitive = false, maxResults = 50): Promise<void> {
  const regex = new RegExp(query, caseSensitive ? 'g' : 'gi');
  
  async function searchDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (matches.length >= maxResults) return;
        
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          await searchDirectory(fullPath);
        } else if (entry.isFile()) {
          const relativePath = path.relative(rootPath, fullPath);
          
          // Skip if file pattern doesn't match
          if (filePattern && !new RegExp(filePattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')).test(relativePath)) {
            continue;
          }
          
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const lines = content.split('\n');
            
            for (let i = 0; i < lines.length && matches.length < maxResults; i++) {
              const line = lines[i];
              let match;
              while ((match = regex.exec(line)) !== null) {
                matches.push({
                  file: relativePath,
                  line: i + 1,
                  column: match.index + 1,
                  content: line,
                  context: [
                    lines[Math.max(0, i - 1)],
                    lines[Math.min(lines.length - 1, i + 1)],
                  ],
                });
              }
            }
          } catch (error) {
            // Skip binary files or files we can't read
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }
  
  await searchDirectory(rootPath);
}

export const toolsV2 = {
  readFile: readFileV2Tool,
  writeFile: writeFileV2Tool,
  editFile: editFileTool,
  listFiles: listFilesV2Tool,
  runCommand: runCommandV2Tool,
  cloneRepo: cloneRepoV2Tool,
  indexProject: indexProjectTool,
  analyzeDependencies: analyzeDependenciesTool,
  searchCodebase: searchCodebaseTool,
  reliableEdit: reliableEditTool,
};
