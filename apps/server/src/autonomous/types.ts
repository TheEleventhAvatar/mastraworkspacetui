import { z } from 'zod';

export const TaskSchema = z.object({
  description: z.string(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  context: z.string().optional(),
});

export const StepSchema = z.object({
  id: z.string(),
  description: z.string(),
  action: z.enum(['read', 'write', 'list', 'command', 'clone']),
  path: z.string().optional(),
  content: z.string().optional(),
  command: z.string().optional(),
  expectedOutcome: z.string().optional(),
});

export const ExecutionResultSchema = z.object({
  stepId: z.string(),
  success: z.boolean(),
  output: z.string(),
  error: z.string().optional(),
  duration: z.number(),
});

export const PlanSchema = z.object({
  taskId: z.string(),
  steps: z.array(StepSchema),
  estimatedTime: z.number().optional(),
});

export type Task = z.infer<typeof TaskSchema>;
export type Step = z.infer<typeof StepSchema>;
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;
export type Plan = z.infer<typeof PlanSchema>;

export interface AgentContext {
  workspace: string;
  taskId: string;
  currentStep: number;
  executionHistory: ExecutionResult[];
  relevantFiles: string[];
}
