import { createTool } from '@mastra/core/tools';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { z } from 'zod';

const execAsync = promisify(exec);

// File reading tool
export const readFileTool = createTool({
  id: 'readFile',
  description: 'Read the contents of a file',
  inputSchema: z.object({
    path: z.string().describe('File path to read'),
  }),
  execute: async ({ path }) => {
    try {
      const content = await fs.readFile(path, 'utf-8');
      return { success: true, content };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  },
});

// File writing tool
export const writeFileTool = createTool({
  id: 'writeFile',
  description: 'Write content to a file',
  inputSchema: z.object({
    path: z.string().describe('File path to write'),
    content: z.string().describe('Content to write'),
  }),
  execute: async ({ path: filePath, content }) => {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  },
});

// Directory listing tool
export const listFilesTool = createTool({
  id: 'listFiles',
  description: 'List files and directories in a path',
  inputSchema: z.object({
    path: z.string().describe('Directory path to list'),
    recursive: z.boolean().default(false).describe('Whether to list recursively'),
  }),
  execute: async ({ path: dirPath, recursive }) => {
    try {
      const listDir = async (dir: string, prefix = ''): Promise<string[]> => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const files: string[] = [];
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.join(prefix, entry.name);
          
          if (entry.isDirectory() && recursive) {
            files.push(...await listDir(fullPath, relativePath));
          } else {
            files.push(relativePath);
          }
        }
        return files;
      };
      
      const files = await listDir(dirPath);
      return { success: true, files };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  },
});

// Shell command tool
export const runCommandTool = createTool({
  id: 'runCommand',
  description: 'Execute a shell command',
  inputSchema: z.object({
    command: z.string().describe('Command to execute'),
    cwd: z.string().optional().describe('Working directory'),
    timeout: z.number().default(30000).describe('Timeout in milliseconds'),
  }),
  execute: async ({ command, cwd, timeout }) => {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: cwd || process.cwd(),
        timeout,
      });
      
      return { 
        success: true, 
        stdout: stdout.trim(),
        stderr: stderr.trim(),
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

// Git clone tool
export const cloneRepoTool = createTool({
  id: 'cloneRepo',
  description: 'Clone a git repository',
  inputSchema: z.object({
    url: z.string().describe('Repository URL to clone'),
    targetDir: z.string().describe('Target directory for cloning'),
  }),
  execute: async ({ url, targetDir }) => {
    try {
      await fs.mkdir(targetDir, { recursive: true });
      const { stdout, stderr } = await execAsync(`git clone ${url} ${targetDir}`);
      
      return { 
        success: true, 
        stdout: stdout.trim(),
        stderr: stderr.trim(),
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

export const tools = {
  readFile: readFileTool,
  writeFile: writeFileTool,
  listFiles: listFilesTool,
  runCommand: runCommandTool,
  cloneRepo: cloneRepoTool,
};
