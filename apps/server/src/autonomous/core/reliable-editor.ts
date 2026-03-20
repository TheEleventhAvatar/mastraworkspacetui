import { promises as fs } from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface EditOperation {
  type: 'insert' | 'delete' | 'replace' | 'move';
  filePath: string;
  position: {
    line: number;
    column?: number;
    deleteLength?: number;
  };
  content?: string;
  targetPosition?: {
    line: number;
    column?: number;
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  syntaxValid: boolean;
  canRollback: boolean;
}

export interface EditResult {
  success: boolean;
  operation: EditOperation;
  backupPath?: string;
  validationResult: ValidationResult;
  rollbackData?: any;
  error?: string;
}

export class ReliableCodeEditor {
  private backupDir: string;
  private rollbackStack: Map<string, EditOperation[]> = new Map();

  constructor(backupDir: string = '/tmp/mastra-backups') {
    this.backupDir = backupDir;
  }

  // 🛡️ RELIABLE EDITING WITH VALIDATION AND ROLLBACK
  async performEdit(operation: EditOperation): Promise<EditResult> {
    try {
      // Step 1: Create backup
      const backupPath = await this.createBackup(operation.filePath);
      
      // Step 2: Validate before edit
      const validationResult = await this.validateEdit(operation);
      
      if (!validationResult.valid) {
        return {
          success: false,
          operation,
          validationResult,
          error: `Validation failed: ${validationResult.errors.join(', ')}`,
        };
      }

      // Step 3: Perform the edit
      await this.executeEdit(operation);
      
      // Step 4: Validate after edit
      const postValidation = await this.validateFile(operation.filePath);
      
      // Step 5: Store rollback information
      this.storeRollbackData(operation.filePath, operation);

      return {
        success: true,
        operation,
        backupPath,
        validationResult: postValidation,
      };
    } catch (error) {
      // Rollback on failure
      await this.rollbackEdit(operation.filePath);
      
      return {
        success: false,
        operation,
        validationResult: { valid: false, errors: [], warnings: [], syntaxValid: false, canRollback: true },
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async createBackup(filePath: string): Promise<string> {
    const timestamp = Date.now();
    const fileName = path.basename(filePath);
    const backupPath = path.join(this.backupDir, `${fileName}.${timestamp}.backup`);
    
    try {
      // Ensure backup directory exists
      await fs.mkdir(this.backupDir, { recursive: true });
      
      // Copy file to backup location
      await fs.copyFile(filePath, backupPath);
      
      return backupPath;
    } catch (error) {
      throw new Error(`Failed to create backup: ${error}`);
    }
  }

  private async validateEdit(operation: EditOperation): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if file exists
    try {
      await fs.access(operation.filePath);
    } catch {
      if (operation.type !== 'insert') {
        errors.push('File does not exist and operation is not insert');
      }
    }

    // Validate position
    if (operation.position.line < 1) {
      errors.push('Invalid line position (must be >= 1)');
    }

    // Validate content for relevant operations
    if ((operation.type === 'insert' || operation.type === 'replace') && !operation.content) {
      errors.push('Content is required for insert/replace operations');
    }

    // Check for potentially dangerous operations
    if (operation.content && operation.content.length > 10000) {
      warnings.push('Large content insertion detected (>10KB)');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      syntaxValid: true, // Will be checked after edit
      canRollback: true,
    };
  }

  private async executeEdit(operation: EditOperation): Promise<void> {
    const content = await fs.readFile(operation.filePath, 'utf-8');
    const lines = content.split('\n');

    switch (operation.type) {
      case 'insert':
        this.insertContent(lines, operation);
        break;
      case 'delete':
        this.deleteContent(lines, operation);
        break;
      case 'replace':
        this.replaceContent(lines, operation);
        break;
      case 'move':
        this.moveContent(lines, operation);
        break;
      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }

    await fs.writeFile(operation.filePath, lines.join('\n'), 'utf-8');
  }

  private insertContent(lines: string[], operation: EditOperation): void {
    const { line, column = 0 } = operation.position;
    const targetLine = lines[line - 1] || '';
    
    if (column === 0) {
      // Insert at beginning of line
      lines[line - 1] = operation.content + targetLine;
    } else {
      // Insert at specific column
      lines[line - 1] = targetLine.slice(0, column) + operation.content + targetLine.slice(column);
    }
  }

  private deleteContent(lines: string[], operation: EditOperation): void {
    const { line, column = 0, deleteLength = 1 } = operation.position;
    const targetLine = lines[line - 1] || '';
    
    lines[line - 1] = targetLine.slice(0, column) + targetLine.slice(column + deleteLength);
  }

  private replaceContent(lines: string[], operation: EditOperation): void {
    const { line, column = 0, deleteLength = 1 } = operation.position;
    const targetLine = lines[line - 1] || '';
    
    lines[line - 1] = targetLine.slice(0, column) + operation.content + targetLine.slice(column + deleteLength);
  }

  private moveContent(lines: string[], operation: EditOperation): void {
    if (!operation.targetPosition) {
      throw new Error('Target position is required for move operation');
    }

    const { line, column = 0, deleteLength = 1 } = operation.position;
    const content = lines[line - 1].slice(column, column + deleteLength);
    
    // Remove from original position
    this.deleteContent(lines, operation);
    
    // Insert at target position
    const moveOperation: EditOperation = {
      type: 'insert',
      filePath: operation.filePath,
      position: operation.targetPosition,
      content,
    };
    
    this.insertContent(lines, moveOperation);
  }

  async validateFile(filePath: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let syntaxValid = true;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const extension = path.extname(filePath);

      // Basic syntax validation for common file types
      if (extension === '.js' || extension === '.jsx') {
        syntaxValid = await this.validateJavaScript(content);
      } else if (extension === '.ts' || extension === '.tsx') {
        syntaxValid = await this.validateTypeScript(content);
      } else if (extension === '.json') {
        syntaxValid = await this.validateJSON(content);
      } else if (extension === '.py') {
        syntaxValid = await this.validatePython(content);
      }

      // Check for common issues
      if (content.length > 100000) {
        warnings.push('Large file size detected (>100KB)');
      }

      if (content.split('\n').length > 1000) {
        warnings.push('Many lines detected (>1000)');
      }

    } catch (error) {
      errors.push(`File validation failed: ${error}`);
      syntaxValid = false;
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      syntaxValid,
      canRollback: true,
    };
  }

  private async validateJavaScript(content: string): Promise<boolean> {
    try {
      // Write to temp file and validate
      const tempFile = `/tmp/temp-${Date.now()}.js`;
      await fs.writeFile(tempFile, content, 'utf-8');
      const { stderr } = await execAsync(`node --check "${tempFile}"`);
      await fs.unlink(tempFile);
      return stderr.length === 0;
    } catch {
      return false;
    }
  }

  private async validateTypeScript(content: string): Promise<boolean> {
    try {
      // Write to temp file and validate
      const tempFile = `/tmp/temp-${Date.now()}.ts`;
      await fs.writeFile(tempFile, content, 'utf-8');
      const { stderr } = await execAsync(`npx tsc --noEmit "${tempFile}"`);
      await fs.unlink(tempFile);
      return stderr.length === 0;
    } catch {
      // Fallback: check for basic TypeScript syntax
      return this.validateJavaScript(content); // Basic check
    }
  }

  private async validateJSON(content: string): Promise<boolean> {
    try {
      JSON.parse(content);
      return true;
    } catch {
      return false;
    }
  }

  private async validatePython(content: string): Promise<boolean> {
    try {
      // Write to temp file and validate
      const tempFile = `/tmp/temp-${Date.now()}.py`;
      await fs.writeFile(tempFile, content, 'utf-8');
      const { stderr } = await execAsync(`python3 -m py_compile "${tempFile}"`);
      await fs.unlink(tempFile);
      return stderr.length === 0;
    } catch {
      return false;
    }
  }

  private storeRollbackData(filePath: string, operation: EditOperation): void {
    if (!this.rollbackStack.has(filePath)) {
      this.rollbackStack.set(filePath, []);
    }
    
    const stack = this.rollbackStack.get(filePath)!;
    stack.push(operation);
    
    // Keep only last 10 operations per file
    if (stack.length > 10) {
      stack.shift();
    }
  }

  async rollbackEdit(filePath: string): Promise<boolean> {
    try {
      const stack = this.rollbackStack.get(filePath);
      if (!stack || stack.length === 0) {
        return false;
      }

      const lastOperation = stack.pop()!;
      const backupPath = await this.findLatestBackup(filePath);
      
      if (backupPath) {
        await fs.copyFile(backupPath, filePath);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`Rollback failed for ${filePath}:`, error);
      return false;
    }
  }

  private async findLatestBackup(filePath: string): Promise<string | null> {
    try {
      const fileName = path.basename(filePath);
      const backupPattern = `${fileName}.*.backup`;
      
      const { stdout } = await execAsync(`ls -t ${this.backupDir}/${backupPattern} 2>/dev/null | head -1`);
      
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  // 🔄 BATCH OPERATIONS
  async performBatchEdits(operations: EditOperation[]): Promise<EditResult[]> {
    const results: EditResult[] = [];
    
    for (const operation of operations) {
      const result = await this.performEdit(operation);
      results.push(result);
      
      // Stop on first failure
      if (!result.success) {
        // Rollback all previous successful edits
        for (let i = results.length - 2; i >= 0; i--) {
          if (results[i].success) {
            await this.rollbackEdit(results[i].operation.filePath);
          }
        }
        break;
      }
    }
    
    return results;
  }

  // 🧹 CLEANUP
  async cleanupOldBackups(olderThanHours: number = 24): Promise<void> {
    try {
      const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
      const { stdout } = await execAsync(`find ${this.backupDir} -name "*.backup" -type f`);
      
      const backupFiles = stdout.trim().split('\n').filter(Boolean);
      
      for (const backupFile of backupFiles) {
        const stats = await fs.stat(backupFile);
        if (stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(backupFile);
        }
      }
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }

  // 📊 STATISTICS
  getEditStatistics(): {
    totalEdits: number;
    successfulEdits: number;
    rollbackCount: number;
    backupCount: number;
  } {
    let totalEdits = 0;
    let successfulEdits = 0;
    
    for (const stack of Array.from(this.rollbackStack.values())) {
      totalEdits += stack.length;
      successfulEdits += stack.length; // Assuming all in stack were successful
    }

    return {
      totalEdits,
      successfulEdits,
      rollbackCount: 0, // Would need to track this separately
      backupCount: 0, // Would need to scan backup directory
    };
  }
}
