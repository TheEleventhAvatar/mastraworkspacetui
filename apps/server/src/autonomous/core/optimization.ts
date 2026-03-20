export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  timestamp: number;
}

export interface ErrorContext {
  stepId: string;
  action: string;
  error: string;
  stackTrace?: string;
  systemState: any;
  previousAttempts: number;
  timestamp: number;
}

export interface RecoveryStrategy {
  type: 'retry' | 'fallback' | 'skip' | 'escalate';
  confidence: number;
  description: string;
  actions: string[];
}

export class OptimizationManager {
  private tokenUsage: TokenUsage[] = [];
  private errorHistory: ErrorContext[] = [];
  private totalCost = 0;
  private tokenBudget: number;

  constructor(tokenBudget: number = 100000) { // 100k tokens default budget
    this.tokenBudget = tokenBudget;
  }

  // 💰 TOKEN USAGE TRACKING
  trackTokenUsage(inputTokens: number, outputTokens: number, model: string = 'gpt-4o'): TokenUsage {
    const cost = this.calculateCost(inputTokens, outputTokens, model);
    const usage: TokenUsage = {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      cost,
      timestamp: Date.now(),
    };

    this.tokenUsage.push(usage);
    this.totalCost += cost;

    return usage;
  }

  private calculateCost(inputTokens: number, outputTokens: number, model: string): number {
    // Approximate pricing (in USD)
    const pricing = {
      'gpt-4o': { input: 0.005, output: 0.015 }, // per 1k tokens
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
    };

    const modelPricing = pricing[model as keyof typeof pricing] || pricing['gpt-4o'];
    return (inputTokens / 1000) * modelPricing.input + (outputTokens / 1000) * modelPricing.output;
  }

  getTokenUsageStats(): {
    totalTokens: number;
    totalCost: number;
    averageTokensPerRequest: number;
    budgetRemaining: number;
    budgetUsage: number;
  } {
    const totalTokens = this.tokenUsage.reduce((sum, usage) => sum + usage.totalTokens, 0);
    const averageTokensPerRequest = this.tokenUsage.length > 0 ? totalTokens / this.tokenUsage.length : 0;
    const budgetUsage = (totalTokens / this.tokenBudget) * 100;
    const budgetRemaining = Math.max(0, this.tokenBudget - totalTokens);

    return {
      totalTokens,
      totalCost: this.totalCost,
      averageTokensPerRequest,
      budgetRemaining,
      budgetUsage,
    };
  }

  // 🧠 SMART PROMPT OPTIMIZATION
  optimizePrompt(prompt: string, context: {
    model: string;
    maxTokens?: number;
    priority: 'low' | 'medium' | 'high';
  }): string {
    const { model, maxTokens = 4096, priority } = context;
    
    let optimized = prompt;

    // Remove redundant whitespace
    optimized = optimized.replace(/\s+/g, ' ').trim();

    // Remove verbose phrases based on priority
    if (priority === 'low') {
      optimized = this.compressPrompt(optimized, 0.3); // 70% compression
    } else if (priority === 'medium') {
      optimized = this.compressPrompt(optimized, 0.5); // 50% compression
    } else {
      optimized = this.compressPrompt(optimized, 0.8); // 20% compression
    }

    // Ensure within token limit
    const estimatedTokens = this.estimateTokens(optimized);
    if (estimatedTokens > maxTokens) {
      optimized = this.truncatePrompt(optimized, maxTokens);
    }

    return optimized;
  }

  private compressPrompt(prompt: string, ratio: number): string {
    // Remove verbose explanations and keep only essential parts
    const verbosePatterns = [
      /You are an? [^.]*\./g,
      /Please [^.]*\./g,
      /Make sure to [^.]*\./g,
      /Requirements: [^.]*\./g,
      /Available tools: [^.]*\./g,
      /Create a [^.]*\./g,
    ];

    let compressed = prompt;
    verbosePatterns.forEach(pattern => {
      compressed = compressed.replace(pattern, '');
    });

    // Keep only the specified ratio of characters
    const targetLength = Math.floor(compressed.length * ratio);
    return compressed.substring(0, targetLength);
  }

  private truncatePrompt(prompt: string, maxTokens: number): string {
    // Rough estimation: 1 token ≈ 4 characters
    const maxChars = maxTokens * 4;
    if (prompt.length <= maxChars) {
      return prompt;
    }

    // Try to truncate at sentence boundaries
    const sentences = prompt.split('. ');
    let result = '';
    
    for (const sentence of sentences) {
      if ((result + sentence).length > maxChars) {
        break;
      }
      result += sentence + '. ';
    }

    return result.trim();
  }

  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  // 🔄 ENHANCED ERROR RECOVERY
  recordError(errorContext: ErrorContext): void {
    this.errorHistory.push(errorContext);
    
    // Keep only recent errors (last 50)
    if (this.errorHistory.length > 50) {
      this.errorHistory = this.errorHistory.slice(-50);
    }
  }

  analyzeErrorPattern(stepId: string, action: string): {
    frequency: number;
    commonErrors: string[];
    recommendedStrategy: RecoveryStrategy;
  } {
    const relatedErrors = this.errorHistory.filter(
      error => error.stepId === stepId || error.action === action
    );

    const frequency = relatedErrors.length;
    const errorCounts = new Map<string, number>();

    relatedErrors.forEach(error => {
      const errorType = this.categorizeError(error.error);
      errorCounts.set(errorType, (errorCounts.get(errorType) || 0) + 1);
    });

    const commonErrors = Array.from(errorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([error]) => error);

    return {
      frequency,
      commonErrors,
      recommendedStrategy: this.recommendRecoveryStrategy(commonErrors, frequency),
    };
  }

  private categorizeError(error: string): string {
    if (error.includes('permission')) return 'permission';
    if (error.includes('not found')) return 'missing_file';
    if (error.includes('syntax')) return 'syntax';
    if (error.includes('timeout')) return 'timeout';
    if (error.includes('memory')) return 'memory';
    if (error.includes('network')) return 'network';
    if (error.includes('dependency')) return 'dependency';
    return 'unknown';
  }

  private recommendRecoveryStrategy(commonErrors: string[], frequency: number): RecoveryStrategy {
    if (frequency >= 3) {
      return {
        type: 'escalate',
        confidence: 0.9,
        description: 'High frequency error - escalate to human',
        actions: ['Notify human operator', 'Pause execution', 'Document error pattern'],
      };
    }

    const primaryError = commonErrors[0];
    
    switch (primaryError) {
      case 'permission':
        return {
          type: 'fallback',
          confidence: 0.8,
          description: 'Permission error - try alternative approach',
          actions: ['Check file permissions', 'Use alternative commands', 'Run with elevated privileges if safe'],
        };
      
      case 'missing_file':
        return {
          type: 'retry',
          confidence: 0.7,
          description: 'Missing file - retry with verification',
          actions: ['Verify file existence', 'Check file paths', 'Create missing files if needed'],
        };
      
      case 'syntax':
        return {
          type: 'retry',
          confidence: 0.8,
          description: 'Syntax error - retry with corrections',
          actions: ['Validate syntax', 'Fix common syntax issues', 'Use linter if available'],
        };
      
      case 'timeout':
        return {
          type: 'fallback',
          confidence: 0.7,
          description: 'Timeout - try with increased limits',
          actions: ['Increase timeout', 'Break into smaller steps', 'Use more efficient approach'],
        };
      
      default:
        return {
          type: 'retry',
          confidence: 0.5,
          description: 'Unknown error - standard retry',
          actions: ['Retry execution', 'Check system state', 'Log detailed error'],
        };
    }
  }

  // 🎯 CONTEXT PRESERVATION
  preserveContext(stepId: string): {
    systemState: any;
    environment: any;
    recentErrors: ErrorContext[];
  } {
    const recentErrors = this.errorHistory
      .filter(error => Date.now() - error.timestamp < 300000) // Last 5 minutes
      .slice(-5); // Last 5 errors

    return {
      systemState: {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        pid: process.pid,
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        cwd: process.cwd(),
      },
      recentErrors,
    };
  }

  // 📊 PERFORMANCE METRICS
  getPerformanceMetrics(): {
    tokenEfficiency: number;
    errorRate: number;
    recoverySuccessRate: number;
    averageRecoveryTime: number;
  } {
    const totalRequests = this.tokenUsage.length;
    const totalErrors = this.errorHistory.length;
    const successfulRecoveries = this.errorHistory.filter(e => e.previousAttempts > 0).length;
    
    return {
      tokenEfficiency: totalRequests > 0 ? this.tokenUsage.reduce((sum, u) => sum + u.totalTokens, 0) / totalRequests : 0,
      errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
      recoverySuccessRate: totalErrors > 0 ? successfulRecoveries / totalErrors : 0,
      averageRecoveryTime: this.calculateAverageRecoveryTime(),
    };
  }

  private calculateAverageRecoveryTime(): number {
    const recoveryTimes = this.errorHistory
      .filter(error => error.previousAttempts > 0)
      .map(error => {
        // This would need to be tracked during actual error recovery
        return 5000; // Placeholder: 5 seconds average
      });

    return recoveryTimes.length > 0 
      ? recoveryTimes.reduce((sum, time) => sum + time, 0) / recoveryTimes.length 
      : 0;
  }

  // 🧹 CLEANUP
  clearOldEntries(olderThanHours: number = 24): void {
    const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
    
    this.tokenUsage = this.tokenUsage.filter(usage => usage.timestamp > cutoffTime);
    this.errorHistory = this.errorHistory.filter(error => error.timestamp > cutoffTime);
  }
}
