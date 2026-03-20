import { createHash } from 'crypto';

export class DiffEditor {
  private static createChecksum(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  static async applyDiff(filePath: string, diff: string): Promise<{ success: boolean; newContent: string; error?: string }> {
    try {
      const fs = await import('fs/promises');
      const currentContent = await fs.readFile(filePath, 'utf-8');
      
      // Parse unified diff format
      const lines = currentContent.split('\n');
      const diffLines = diff.split('\n');
      
      let newContent = currentContent;
      let currentLineIndex = 0;
      
      for (const diffLine of diffLines) {
        if (diffLine.startsWith('@@')) {
          // Parse hunk header to get line numbers
          const match = diffLine.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
          if (match) {
            currentLineIndex = parseInt(match[3]) - 1; // Convert to 0-based
          }
        } else if (diffLine.startsWith(' ')) {
          // Context line - keep as is
          currentLineIndex++;
        } else if (diffLine.startsWith('-')) {
          // Removed line
          lines.splice(currentLineIndex, 1);
        } else if (diffLine.startsWith('+')) {
          // Added line
          lines.splice(currentLineIndex, 0, diffLine.slice(1));
          currentLineIndex++;
        }
      }
      
      newContent = lines.join('\n');
      
      return {
        success: true,
        newContent,
      };
    } catch (error) {
      return {
        success: false,
        newContent: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  static createDiff(oldContent: string, newContent: string): string {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    const diff: string[] = [];
    let oldIndex = 0;
    let newIndex = 0;
    
    // Simple diff implementation - in production, use a proper diff library
    while (oldIndex < oldLines.length || newIndex < newLines.length) {
      if (oldIndex >= oldLines.length) {
        // Only additions remaining
        diff.push(`+${newLines[newIndex]}`);
        newIndex++;
      } else if (newIndex >= newLines.length) {
        // Only deletions remaining
        diff.push(`-${oldLines[oldIndex]}`);
        oldIndex++;
      } else if (oldLines[oldIndex] === newLines[newIndex]) {
        // Same line
        diff.push(` ${oldLines[oldIndex]}`);
        oldIndex++;
        newIndex++;
      } else {
        // Different lines - simplified handling
        diff.push(`-${oldLines[oldIndex]}`);
        diff.push(`+${newLines[newIndex]}`);
        oldIndex++;
        newIndex++;
      }
    }
    
    return diff.join('\n');
  }

  static validateDiff(diff: string): { valid: boolean; error?: string } {
    try {
      const lines = diff.split('\n');
      let hasHunk = false;
      
      for (const line of lines) {
        if (line.startsWith('@@')) {
          hasHunk = true;
        } else if (line && !line.startsWith(' ') && !line.startsWith('-') && !line.startsWith('+')) {
          return { valid: false, error: `Invalid diff line: ${line}` };
        }
      }
      
      if (!hasHunk) {
        return { valid: false, error: 'Diff missing hunk header' };
      }
      
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static getFileChecksum(content: string): string {
    return this.createChecksum(content);
  }

  static hasFileChanged(oldChecksum: string, newContent: string): boolean {
    const newChecksum = this.getFileChecksum(newContent);
    return oldChecksum !== newChecksum;
  }
}
