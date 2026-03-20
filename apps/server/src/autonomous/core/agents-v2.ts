import { Agent } from '@mastra/core/agent';
import { toolsV2 } from './tools-v2';
import { TaskInput, Step, Plan, ExecutionResult, AgentState, GitHubIssue } from './types';
import { GitHubClient } from './github';
import { AgentLogger } from './logger';

export interface VerificationResult {
  success: boolean;
  quality: number;
  issues: string[];
}

export interface FixResult {
  success: boolean;
  step: Step;
  error?: string;
}

export interface RefinementResult {
  success: boolean;
  quality?: number;
  issues?: string[];
}

export interface RecoveryPlanResult {
  success: boolean;
  plan: Plan;
  error?: string;
}

export class ProductionAgent {
  private logger: AgentLogger;
  private github: GitHubClient;
  private state: AgentState;

  constructor(state: AgentState) {
    this.state = state;
    this.logger = new AgentLogger(state);
    this.github = new GitHubClient(this.state.workspace);
  }

  // 🧠 YC-LEVEL: Enhanced planning with repo understanding
  async createPlan(taskInput: TaskInput): Promise<Plan> {
    this.logger.info('planner', 'plan-start', `Creating plan for task: ${taskInput.description}`);

    let taskDescription = taskInput.description;
    let context = taskInput.context || '';

    // Handle GitHub issue input
    if (taskInput.githubIssue) {
      try {
        const issue = await this.github.parseIssue(taskInput.githubIssue);
        const repoContext = await this.github.getRepoContext(issue.owner, issue.repo);
        
        taskDescription = `Fix GitHub issue: ${issue.title}\n\n${issue.body}`;
        context = `Repository: ${issue.owner}/${issue.repo} (${repoContext.language})\nIssue #${issue.issueNumber}`;
        
        this.logger.info('planner', 'plan-github', `Parsed GitHub issue: ${issue.title}`, {
          issueNumber: issue.issueNumber,
          labels: issue.labels,
        });
      } catch (error) {
        this.logger.error('planner', 'plan-github', `Failed to parse GitHub issue: ${error}`);
        throw new Error(`Invalid GitHub issue: ${error}`);
      }
    }

    const prompt = `Task: ${taskDescription}
Context: ${context}
Priority: ${taskInput.priority}
Max steps: ${taskInput.maxSteps}

Tools: read, write, edit, list, command, clone, index, analyze, search

Create JSON plan:
{
  "taskId": "id",
  "steps": [
    {
      "id": "step-1",
      "description": "action",
      "action": "read|write|edit|list|command|clone|index|analyze|search",
      "path": "path",
      "content": "content",
      "command": "command",
      "dependencies": [],
      "expectedOutcome": "result"
    }
  ],
  "estimatedTime": 300,
  "confidence": 0.8
}

Requirements: atomic steps, dependencies, realistic time, engineering practices.`;

    try {
      const agent = new Agent({
        id: 'planner-v2',
        name: 'Production Planner',
        model: 'openai/gpt-4o',
        instructions: 'You are a senior software engineer creating detailed, executable plans.',
      });

      const response = await agent.generate(prompt);
      const planData = this.extractJsonFromResponse(response.text);
      
      if (!planData || !planData.steps) {
        throw new Error('Invalid plan format from agent');
      }

      const plan: Plan = {
        taskId: planData.taskId || `plan-${Date.now()}`,
        steps: planData.steps,
        estimatedTime: planData.estimatedTime,
        confidence: planData.confidence,
      };

      this.logger.info('planner', 'plan-created', `Plan created with ${plan.steps.length} steps`);
      return plan;
    } catch (error) {
      this.logger.error('planner', 'plan-error', `Failed to create plan: ${error}`);
      throw error;
    }
  }

  async executeStep(step: Step): Promise<ExecutionResult> {
    this.logger.info('executor', `step-${step.id}`, `Executing: ${step.description}`);
    const startTime = Date.now();

    try {
      const agent = new Agent({
        id: 'executor-v2',
        name: 'Production Executor',
        model: 'openai/gpt-4o',
        instructions: 'You are a precise software engineer. Execute the given step exactly as specified.',
        tools: toolsV2,
      });

      const prompt = `Step: ${step.id}
Action: ${step.action}
Description: ${step.description}
Path: ${step.path || 'N/A'}
Command: ${step.command || 'N/A'}
Expected: ${step.expectedOutcome || 'N/A'}

Execute precisely. Return result.`;

      const response = await agent.generate(prompt);
      const duration = Date.now() - startTime;

      const result: ExecutionResult = {
        stepId: step.id,
        success: true,
        output: response.text,
        duration,
        filesChanged: this.extractFilesChanged(response.text),
      };

      this.logger.info('executor', `step-${step.id}`, `Step completed in ${duration}ms`);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result: ExecutionResult = {
        stepId: step.id,
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
        filesChanged: [],
      };

      this.logger.error('executor', `step-${step.id}`, `Step failed: ${result.error}`);
      return result;
    }
  }

  // 🔧 YC-LEVEL: Self-healing capabilities
  async createFix(step: Step, failedResult: ExecutionResult): Promise<FixResult> {
    this.logger.info('fixer', `fix-${step.id}`, `Creating fix for failed step`);

    try {
      const agent = new Agent({
        id: 'fixer-v2',
        name: 'Production Fixer',
        model: 'openai/gpt-4o',
        instructions: 'You are a senior engineer specializing in debugging and fixes.',
        tools: toolsV2,
      });

      const prompt = `Failed step:
ID: ${step.id}
Action: ${step.action}
Error: ${failedResult.error}
Output: ${failedResult.output}

Create fix JSON:
{
  "id": "fix-${step.id}",
  "description": "fix description",
  "action": "action",
  "path": "path",
  "content": "content",
  "command": "command",
  "dependencies": [],
  "expectedOutcome": "expected result"
}

Requirements: address root cause, minimal changes, testable.`;

      const response = await agent.generate(prompt);
      const fixData = this.extractJsonFromResponse(response.text);

      if (!fixData) {
        throw new Error('Invalid fix format from agent');
      }

      this.logger.info('fixer', `fix-${step.id}`, `Fix created: ${fixData.description}`);
      
      return {
        success: true,
        step: fixData,
      };
    } catch (error) {
      this.logger.error('fixer', `fix-${step.id}`, `Failed to create fix: ${error}`);
      return {
        success: false,
        step: step,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // 🔍 YC-LEVEL: Intelligent verification
  async verifyTask(taskInput: TaskInput, executionHistory: ExecutionResult[]): Promise<VerificationResult> {
    this.logger.info('verifier', 'verify-start', 'Starting task verification');

    try {
      const agent = new Agent({
        id: 'verifier-v2',
        name: 'Production Verifier',
        model: 'openai/gpt-4o',
        instructions: 'You are a quality assurance engineer verifying task completion.',
      });

      const successfulSteps = executionHistory.filter(r => r.success);
      const failedSteps = executionHistory.filter(r => !r.success);

      const prompt = `Verify this task completion:

ORIGINAL TASK: ${taskInput.description}
PRIORITY: ${taskInput.priority}

EXECUTION RESULTS:
- Total steps: ${executionHistory.length}
- Successful: ${successfulSteps.length}
- Failed: ${failedSteps.length}

SUCCESSFUL STEPS:
${successfulSteps.map(s => `- ${s.stepId}: ${s.output.substring(0, 100)}...`).join('\n')}

FAILED STEPS:
${failedSteps.map(s => `- ${s.stepId}: ${s.error}`).join('\n')}

Analyze the results and provide:
1. Overall success assessment
2. Quality score (0.0-1.0)
3. Any issues or concerns

Return JSON:
{
  "success": true/false,
  "quality": 0.85,
  "issues": ["issue1", "issue2"]
}`;

      const response = await agent.generate(prompt);
      const verificationData = this.extractJsonFromResponse(response.text);

      if (!verificationData) {
        throw new Error('Invalid verification format from agent');
      }

      const result: VerificationResult = {
        success: verificationData.success || false,
        quality: verificationData.quality || 0.5,
        issues: verificationData.issues || [],
      };

      this.logger.info('verifier', 'verify-complete', `Verification complete: ${result.success ? 'PASS' : 'FAIL'} (quality: ${result.quality})`);
      return result;
    } catch (error) {
      this.logger.error('verifier', 'verify-error', `Verification failed: ${error}`);
      return {
        success: false,
        quality: 0.0,
        issues: ['Verification process failed'],
      };
    }
  }

  // 🔧 YC-LEVEL: Intelligent refinement
  async refineTask(taskInput: TaskInput, issues: string[]): Promise<RefinementResult> {
    this.logger.info('refiner', 'refine-start', `Starting refinement for ${issues.length} issues`);

    try {
      const agent = new Agent({
        id: 'refiner-v2',
        name: 'Production Refiner',
        model: 'openai/gpt-4o',
        instructions: 'You are a senior engineer specializing in code refinement and improvement.',
        tools: toolsV2,
      });

      const prompt = `Refine this task based on identified issues:

ORIGINAL TASK: ${taskInput.description}
ISSUES TO ADDRESS:
${issues.map(i => `- ${i}`).join('\n')}

Create refinement steps to address these issues. Return JSON:
{
  "success": true,
  "quality": 0.95,
  "issues": [],
  "refinements": ["refinement1", "refinement2"]
}`;

      const response = await agent.generate(prompt);
      const refinementData = this.extractJsonFromResponse(response.text);

      if (!refinementData) {
        throw new Error('Invalid refinement format from agent');
      }

      this.logger.info('refiner', 'refine-complete', `Refinement complete with quality: ${refinementData.quality || 0.8}`);
      
      return {
        success: refinementData.success || false,
        quality: refinementData.quality,
        issues: refinementData.issues || [],
      };
    } catch (error) {
      this.logger.error('refiner', 'refine-error', `Refinement failed: ${error}`);
      return {
        success: false,
        issues: ['Refinement process failed'],
      };
    }
  }

  // 🚑 YC-LEVEL: Recovery planning
  async createRecoveryPlan(taskInput: TaskInput, errorPatterns: string[]): Promise<RecoveryPlanResult> {
    this.logger.info('recovery', 'recovery-start', `Creating recovery plan for: ${errorPatterns.join(', ')}`);

    try {
      const agent = new Agent({
        id: 'recovery-v2',
        name: 'Production Recovery',
        model: 'openai/gpt-4o',
        instructions: 'You are an expert in error recovery and system restoration.',
        tools: toolsV2,
      });

      const prompt = `Create a recovery plan for this failed task:

ORIGINAL TASK: ${taskInput.description}
ERROR PATTERNS: ${errorPatterns.join(', ')}

Design a recovery strategy to address these errors. Return JSON:
{
  "success": true,
  "plan": {
    "taskId": "recovery-plan",
    "steps": [
      {
        "id": "recovery-1",
        "description": "Recovery step",
        "action": "action",
        "path": "path if needed",
        "content": "content if needed",
        "command": "command if needed",
        "dependencies": [],
        "expectedOutcome": "Expected recovery result"
      }
    ],
    "estimatedTime": 180,
    "confidence": 0.9
  }
}`;

      const response = await agent.generate(prompt);
      const recoveryData = this.extractJsonFromResponse(response.text);

      if (!recoveryData || !recoveryData.plan) {
        throw new Error('Invalid recovery plan format from agent');
      }

      this.logger.info('recovery', 'recovery-complete', `Recovery plan created with ${recoveryData.plan.steps.length} steps`);
      
      return {
        success: true,
        plan: recoveryData.plan,
      };
    } catch (error) {
      this.logger.error('recovery', 'recovery-error', `Recovery planning failed: ${error}`);
      return {
        success: false,
        plan: { taskId: '', steps: [], estimatedTime: 0 },
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // 📂 YC-LEVEL: Repo understanding methods
  async indexProject(): Promise<{success: boolean, index?: any, error?: string}> {
    try {
      if (!toolsV2.indexProject || !toolsV2.indexProject.execute) {
        return {
          success: false,
          error: 'indexProject tool is not available',
        };
      }
      
      const result = await toolsV2.indexProject.execute({}, {} as any) as any;
      
      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Unknown error',
        };
      }
      
      return {
        success: true,
        index: result.index,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async analyzeDependencies(): Promise<{success: boolean, analysis?: any, error?: string}> {
    try {
      if (!toolsV2.analyzeDependencies || !toolsV2.analyzeDependencies.execute) {
        return {
          success: false,
          error: 'analyzeDependencies tool is not available',
        };
      }
      const result = await toolsV2.analyzeDependencies.execute({}, {} as any) as any;
      return {
        success: true,
        analysis: result.analysis,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async verifyStep(step: Step, result: ExecutionResult): Promise<{success: boolean, proceed: boolean, issues: string[]}> {
    // Basic verification - can be enhanced with more sophisticated checks
    const issues: string[] = [];
    
    if (!result.success && !result.error) {
      issues.push('Step failed without error message');
    }
    
    if (result.success && !result.output) {
      issues.push('Step succeeded but produced no output');
    }

    return {
      success: result.success,
      proceed: result.success || issues.length === 0,
      issues,
    };
  }

  private extractJsonFromResponse(text: string): any {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  private extractFilesChanged(output: string): string[] {
    const files: string[] = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes('file:') || line.includes('Created:') || line.includes('Modified:')) {
        const match = line.match(/(?:file|Created|Modified):\s*(\S+)/);
        if (match) {
          files.push(match[1]);
        }
      }
    }
    
    return files;
  }
}
