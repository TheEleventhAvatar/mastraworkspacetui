import { plannerAgent, executorAgent, verifierAgent, fixerAgent } from './agents';
import { Task, Step, Plan, ExecutionResult, AgentContext } from './types';
import chalk from 'chalk';
import ora from 'ora';

export class AutonomousCoordinator {
  private context: AgentContext;
  private maxRetries = 2;

  constructor(workspace: string) {
    this.context = {
      workspace,
      taskId: '',
      currentStep: 0,
      executionHistory: [],
      relevantFiles: [],
    };
  }

  async executeTask(task: Task): Promise<void> {
    const taskId = `task-${Date.now()}`;
    this.context.taskId = taskId;
    
    console.log(chalk.blue.bold(`🚀 Starting task: ${task.description}`));
    console.log(chalk.gray(`Task ID: ${taskId}`));

    try {
      // Step 1: Plan the task
      const plan = await this.createPlan(task);
      console.log(chalk.green(`✓ Created plan with ${plan.steps.length} steps`));

      // Step 2: Execute each step
      for (let i = 0; i < plan.steps.length; i++) {
        this.context.currentStep = i;
        await this.executeStepWithRetry(plan.steps[i]);
      }

      console.log(chalk.green.bold('✅ Task completed successfully!'));
    } catch (error) {
      console.log(chalk.red.bold(`❌ Task failed: ${error}`));
    }
  }

  private async createPlan(task: Task): Promise<Plan> {
    const spinner = ora('Creating execution plan...').start();
    
    try {
      const prompt = `Create a detailed execution plan for this task:

Task: ${task.description}
Priority: ${task.priority}
${task.context ? `Context: ${task.context}` : ''}

Break this down into specific, executable steps using the available tools.`;

      const response = await plannerAgent.generate(prompt);
      
      // Parse the plan from the response
      const plan: Plan = {
        taskId: this.context.taskId,
        steps: this.parseStepsFromResponse(response.text),
        estimatedTime: 0, // TODO: Extract from response
      };

      spinner.succeed('Plan created');
      return plan;
    } catch (error) {
      spinner.fail('Failed to create plan');
      throw error;
    }
  }

  private async executeStepWithRetry(step: Step): Promise<void> {
    let retries = 0;
    let currentStep = step;

    while (retries <= this.maxRetries) {
      try {
        console.log(chalk.yellow(`\n📋 Step ${this.context.currentStep + 1}: ${currentStep.description}`));
        
        // Execute the step
        const result = await this.executeStep(currentStep);
        
        // Verify the result
        const verification = await this.verifyStep(currentStep, result);
        
        if (verification.success) {
          console.log(chalk.green(`✓ Step completed successfully`));
          this.context.executionHistory.push(result);
          return;
        } else {
          console.log(chalk.yellow(`⚠️  Step verification failed: ${verification.issues.join(', ')}`));
          
          if (retries < this.maxRetries) {
            console.log(chalk.blue(`🔄 Retrying... (${retries + 1}/${this.maxRetries})`));
            currentStep = await this.createFixStep(currentStep, result, verification);
            retries++;
          } else {
            console.log(chalk.red(`❌ Max retries exceeded for step: ${currentStep.description}`));
            throw new Error(`Step failed after ${this.maxRetries} retries`);
          }
        }
      } catch (error) {
        console.log(chalk.red(`❌ Execution error: ${error}`));
        
        if (retries < this.maxRetries) {
          currentStep = await this.createFixStep(currentStep, {
            stepId: currentStep.id,
            success: false,
            output: '',
            error: error instanceof Error ? error.message : 'Unknown error',
            duration: 0,
          }, { success: false, issues: [error instanceof Error ? error.message : 'Unknown error'], suggestions: [], proceed: false });
          retries++;
        } else {
          throw error;
        }
      }
    }
  }

  private async executeStep(step: Step): Promise<ExecutionResult> {
    const startTime = Date.now();
    const spinner = ora(`Executing: ${step.description}`).start();

    try {
      const prompt = `Execute this step:

${JSON.stringify(step, null, 2)}

Use the appropriate tool to complete this action. Report the result clearly.`;

      const response = await executorAgent.generate(prompt);
      const duration = Date.now() - startTime;

      spinner.succeed('Step executed');
      
      return {
        stepId: step.id,
        success: true,
        output: response.text,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      spinner.fail('Step execution failed');
      
      return {
        stepId: step.id,
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
      };
    }
  }

  private async verifyStep(step: Step, result: ExecutionResult): Promise<{ success: boolean; issues: string[]; suggestions: string[]; proceed: boolean }> {
    const spinner = ora('Verifying result...').start();

    try {
      const prompt = `Verify this execution result:

Step: ${step.description}
Expected outcome: ${step.expectedOutcome || 'Not specified'}

Execution result:
${JSON.stringify(result, null, 2)}

Did this step complete successfully? Does the result match expectations?`;

      const response = await verifierAgent.generate(prompt);
      
      // Parse verification result (simplified)
      const verification = {
        success: result.success && !response.text.toLowerCase().includes('failed'),
        issues: result.error ? [result.error] : [],
        suggestions: [],
        proceed: result.success,
      };

      spinner.succeed('Verification complete');
      return verification;
    } catch (error) {
      spinner.fail('Verification failed');
      return {
        success: false,
        issues: [error instanceof Error ? error.message : 'Unknown error'],
        suggestions: [],
        proceed: false,
      };
    }
  }

  private async createFixStep(originalStep: Step, result: ExecutionResult, verification: any): Promise<Step> {
    const spinner = ora('Creating fix...').start();

    try {
      const prompt = `This step failed and needs to be fixed:

Original step: ${JSON.stringify(originalStep, null, 2)}
Execution result: ${JSON.stringify(result, null, 2)}
Verification issues: ${JSON.stringify(verification, null, 2)}

Create a corrected step that will fix this issue. Focus on the root cause.`;

      const response = await fixerAgent.generate(prompt);
      
      // For now, return a simple retry (TODO: Parse response properly)
      spinner.succeed('Fix created');
      
      return {
        ...originalStep,
        id: `${originalStep.id}-retry-${Date.now()}`,
        description: `${originalStep.description} (retry)`,
      };
    } catch (error) {
      spinner.fail('Failed to create fix');
      throw error;
    }
  }

  private parseStepsFromResponse(response: string): Step[] {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.steps && Array.isArray(parsed.steps)) {
          return parsed.steps.map((step: any, index: number) => ({
            id: step.id || `step-${index + 1}`,
            description: step.description || `Step ${index + 1}`,
            action: step.action || 'command',
            path: step.path,
            content: step.content,
            command: step.command,
            expectedOutcome: step.expectedOutcome,
          }));
        }
      }
    } catch (error) {
      console.log('JSON parsing failed, falling back to text parsing');
    }

    // Fallback: parse simple text steps
    const lines = response.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('```') && !line.startsWith('{'));
    
    if (lines.length > 0) {
      return lines.map((line, index) => ({
        id: `step-${index + 1}`,
        description: line,
        action: 'command' as const,
        command: line,
      }));
    }

    // Final fallback: single step
    return [{
      id: 'step-1',
      description: response.trim(),
      action: 'command' as const,
      command: response.trim(),
    }];
  }
}
