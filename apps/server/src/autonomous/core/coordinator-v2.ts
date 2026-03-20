import { ProductionAgent } from './agents-v2';
import { TaskInput, Step, Plan, ExecutionResult, AgentState } from './types';
import { AgentLogger } from './logger';
import chalk from 'chalk';

export class ProductionCoordinator {
  private agent: ProductionAgent;
  private state: AgentState;
  private maxRetries = 3;
  private maxSteps = 20;
  private verificationThreshold = 0.8;

  constructor(workspace: string) {
    this.state = {
      workspace,
      taskId: `task-${Date.now()}`,
      currentStep: 0,
      executionHistory: [],
      trace: [],
      relevantFiles: [],
      fileChecksums: new Map(),
      stepDependencies: new Map(),
    };

    this.agent = new ProductionAgent(this.state);
  }

  async executeTask(taskInput: TaskInput): Promise<void> {
    console.log(chalk.blue.bold('🧠 YC-Level Autonomous Agent'));
    console.log(chalk.gray(`Task: ${taskInput.description}`));
    console.log(chalk.gray(`Task ID: ${this.state.taskId}`));
    
    if (taskInput.maxSteps) {
      this.maxSteps = Math.min(taskInput.maxSteps, 50);
    }

    try {
      // 🧠 INTELLIGENT TASK DECOMPOSITION
      console.log(chalk.yellow('\n🎯 Phase 1: Strategic Planning'));
      const plan = await this.agent.createPlan(taskInput);
      console.log(chalk.green(`✓ Strategic plan: ${plan.steps.length} steps, ${plan.estimatedTime}s estimated`));
      
      if (plan.confidence && plan.confidence < 0.5) {
        console.log(chalk.yellow(`⚠️  Low confidence plan (${plan.confidence}), refining...`));
        // Intelligence: Refine low-confidence plans
        await this.refinePlan(plan, taskInput);
      }

      // 🔄 EXECUTION WITH SELF-HEALING
      console.log(chalk.yellow('\n🔄 Phase 2: Intelligent Execution'));
      let success = await this.executeWithSelfHealing(plan);
      
      if (!success) {
        console.log(chalk.red('\n❌ Execution failed, attempting recovery...'));
        success = await this.recoverFromFailure(plan, taskInput);
      }

      // ✅ VERIFICATION & REFINEMENT
      console.log(chalk.yellow('\n🔍 Phase 3: Verification & Refinement'));
      const verificationResult = await this.verifyAndRefine(taskInput);
      
      if (verificationResult.success) {
        console.log(chalk.green.bold('\n🎉 Task completed successfully!'));
        console.log(chalk.gray(`Quality score: ${verificationResult.quality}`));
      } else {
        console.log(chalk.yellow('\n⚠️  Task completed with issues'));
        console.log(chalk.gray(`Issues: ${verificationResult.issues.join(', ')}`));
      }

      this.exportTrace();
    } catch (error) {
      console.log(chalk.red.bold('\n💥 Critical failure:'));
      console.log(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
      throw error;
    }
  }

  private async executeWithSelfHealing(plan: Plan): Promise<boolean> {
    let executedSteps = 0;
    
    for (let i = 0; i < plan.steps.length && executedSteps < this.maxSteps; i++) {
      const step = plan.steps[i];
      
      // Check dependencies
      if (!this.areDependenciesMet(step)) {
        console.log(chalk.yellow(`⏸️  Skipping step ${step.id} - dependencies not met`));
        continue;
      }

      console.log(chalk.blue(`\n🎯 Step ${executedSteps + 1}/${this.maxSteps}: ${step.description}`));
      
      let success = false;
      let attempts = 0;
      
      // 🔁 SELF-HEALING LOOP
      while (!success && attempts < this.maxRetries) {
        attempts++;
        console.log(chalk.gray(`Attempt ${attempts}/${this.maxRetries}`));
        
        const result = await this.agent.executeStep(step);
        
        if (result.success) {
          console.log(chalk.green(`✅ Step ${step.id} completed`));
          this.state.executionHistory.push(result);
          this.updateDependencies(step);
          success = true;
          executedSteps++;
        } else {
          console.log(chalk.red(`❌ Step ${step.id} failed: ${result.error}`));
          
          if (attempts < this.maxRetries) {
            console.log(chalk.yellow(`🔧 Attempting self-healing...`));
            const healed = await this.attemptHealing(step, result);
            if (healed) {
              success = true;
              executedSteps++;
            }
          }
        }
      }
      
      if (!success) {
        console.log(chalk.red(`💥 Step ${step.id} failed after ${this.maxRetries} retries`));
        return false;
      }
    }
    
    return true;
  }

  private async attemptHealing(step: Step, failedResult: ExecutionResult): Promise<boolean> {
    console.log(chalk.yellow('🧠 Intelligent error analysis...'));
    
    const fixResult = await this.agent.createFix(step, failedResult);
    if (!fixResult.success) {
      console.log(chalk.red('❌ Could not generate fix'));
      return false;
    }

    console.log(chalk.blue('🔧 Applying fix...'));
    const fixExecution = await this.agent.executeStep(fixResult.step);
    
    if (fixExecution.success) {
      console.log(chalk.green('✅ Self-healing successful!'));
      this.state.executionHistory.push(fixExecution);
      return true;
    } else {
      console.log(chalk.red('❌ Fix failed'));
      return false;
    }
  }

  private async verifyAndRefine(taskInput: TaskInput): Promise<{success: boolean, quality: number, issues: string[]}> {
    console.log(chalk.blue('🔍 Verifying task completion...'));
    
    const verificationResult = await this.agent.verifyTask(taskInput, this.state.executionHistory);
    
    if (verificationResult.success && verificationResult.quality >= this.verificationThreshold) {
      return {
        success: true,
        quality: verificationResult.quality,
        issues: []
      };
    }
    
    // 🧠 INTELLIGENT REFINEMENT
    if (verificationResult.quality < this.verificationThreshold) {
      console.log(chalk.yellow('🔧 Quality below threshold, refining...'));
      const refinementResult = await this.agent.refineTask(taskInput, verificationResult.issues);
      
      if (refinementResult.success) {
        console.log(chalk.green('✅ Refinement successful'));
        return {
          success: true,
          quality: refinementResult.quality || verificationResult.quality + 0.2,
          issues: []
        };
      }
    }
    
    return {
      success: verificationResult.success,
      quality: verificationResult.quality,
      issues: verificationResult.issues
    };
  }

  private async refinePlan(plan: Plan, taskInput: TaskInput): Promise<void> {
    console.log(chalk.blue('🧠 Refining plan with deeper analysis...'));
    
    // Use repo understanding to create better plan
    const context = await this.gatherProjectContext();
    const refinedPlan = await this.agent.createPlan({
      ...taskInput,
      context: `${taskInput.context || ''}\n\nProject Context:\n${context}`
    });
    
    // Replace current plan with refined version
    plan.steps = refinedPlan.steps;
    plan.confidence = Math.max(plan.confidence || 0.5, refinedPlan.confidence || 0.7);
    
    console.log(chalk.green(`✓ Plan refined: ${plan.steps.length} steps, confidence: ${plan.confidence}`));
  }

  private async gatherProjectContext(): Promise<string> {
    try {
      const indexResult = await this.agent.indexProject();
      const depResult = await this.agent.analyzeDependencies();
      
      let context = `Project Structure:\n`;
      if (indexResult.success) {
        context += `- Total files: ${indexResult.index.totalFiles}\n`;
        context += `- Main directories: ${indexResult.index.directories.slice(0, 5).join(', ')}\n`;
      }
      
      if (depResult.success && depResult.analysis.packageJson) {
        context += `\nDependencies:\n`;
        context += `- Main packages: ${Object.keys(depResult.analysis.packageJson.dependencies).slice(0, 5).join(', ')}\n`;
      }
      
      return context;
    } catch (error) {
      return 'Unable to gather project context';
    }
  }

  private async recoverFromFailure(plan: Plan, taskInput: TaskInput): Promise<boolean> {
    console.log(chalk.yellow('🚑 Emergency recovery protocol...'));
    
    // Analyze what went wrong
    const failedSteps = this.state.executionHistory.filter(r => !r.success);
    const commonErrors = this.analyzeFailurePatterns(failedSteps);
    
    console.log(chalk.blue(`🔍 Failure analysis: ${commonErrors.join(', ')}`));
    
    // Create recovery plan
    const recoveryPlan = await this.agent.createRecoveryPlan(taskInput, commonErrors);
    
    if (recoveryPlan.success) {
      console.log(chalk.green('🔧 Executing recovery plan...'));
      return await this.executeWithSelfHealing(recoveryPlan.plan);
    }
    
    return false;
  }

  private analyzeFailurePatterns(failedResults: ExecutionResult[]): string[] {
    const patterns = new Set<string>();
    
    for (const result of failedResults) {
      if (result.error?.includes('permission')) patterns.add('Permission issues');
      if (result.error?.includes('not found')) patterns.add('Missing files');
      if (result.error?.includes('syntax')) patterns.add('Syntax errors');
      if (result.error?.includes('dependency')) patterns.add('Dependency issues');
    }
    
    return Array.from(patterns);
  }

  private areDependenciesMet(step: Step): boolean {
    if (!step.dependencies || step.dependencies.length === 0) {
      return true;
    }

    return step.dependencies.every(dep => {
      const completedStep = this.state.executionHistory.find(result => result.stepId === dep);
      return completedStep && completedStep.success;
    });
  }

  private updateDependencies(step: Step): void {
    if (!step.dependencies || step.dependencies.length === 0) {
      return;
    }

    this.state.stepDependencies.set(step.id, step.dependencies);
  }

  getExecutionSummary() {
    const executedSteps = this.state.executionHistory.length;
    const successfulSteps = this.state.executionHistory.filter(r => r.success).length;
    const totalSteps = this.state.currentStep + 1;
    
    // Extract files from execution history
    const filesChanged = new Set<string>();
    this.state.executionHistory.forEach(result => {
      if (result.filesChanged) {
        result.filesChanged.forEach((file: string) => filesChanged.add(file));
      }
    });
    
    return {
      totalSteps,
      executedSteps,
      successfulSteps,
      successRate: executedSteps > 0 ? successfulSteps / executedSteps : 0,
      taskId: this.state.taskId,
      workspace: this.state.workspace,
      filesChanged: Array.from(filesChanged),
    };
  }

  private exportTrace(): void {
    const traceData = {
      taskId: this.state.taskId,
      workspace: this.state.workspace,
      executionHistory: this.state.executionHistory,
      trace: this.state.trace,
      timestamp: new Date().toISOString(),
    };
    
    try {
      const fs = require('fs/promises');
      const traceFile = `${this.state.workspace}/agent-trace-${this.state.taskId}.json`;
      fs.writeFile(traceFile, JSON.stringify(traceData, null, 2), 'utf-8');
      console.log(chalk.gray(`📝 Trace exported to: ${traceFile}`));
    } catch (error) {
      console.log(chalk.yellow('⚠️  Could not export trace'));
    }
  }
}
