import { z } from 'zod';

export const TaskInputSchema = z.object({
  description: z.string(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  context: z.string().optional(),
  githubIssue: z.string().url().optional(),
  maxSteps: z.number().min(1).max(50).default(20),
});

export const StepSchema = z.object({
  id: z.string(),
  description: z.string(),
  action: z.enum(['read', 'write', 'edit', 'list', 'command', 'clone', 'index', 'analyze', 'search']),
  path: z.string().optional(),
  content: z.string().optional(),
  command: z.string().optional(),
  diff: z.string().optional(),
  expectedOutcome: z.string().optional(),
  dependencies: z.array(z.string()).default([]),
});

export const ExecutionResultSchema = z.object({
  stepId: z.string(),
  success: z.boolean(),
  output: z.string(),
  error: z.string().optional(),
  duration: z.number(),
  filesChanged: z.array(z.string()).default([]),
  checksum: z.string().optional(),
});

export const AgentTraceSchema = z.object({
  timestamp: z.string(),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  agent: z.string(),
  stepId: z.string(),
  message: z.string(),
  metadata: z.record(z.any()).optional(),
});

export const PlanSchema = z.object({
  taskId: z.string(),
  steps: z.array(StepSchema),
  estimatedTime: z.number().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type TaskInput = z.infer<typeof TaskInputSchema>;
export type Step = z.infer<typeof StepSchema>;
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;
export type AgentTrace = z.infer<typeof AgentTraceSchema>;
export type Plan = z.infer<typeof PlanSchema>;

export interface AgentState {
  workspace: string;
  taskId: string;
  currentStep: number;
  executionHistory: ExecutionResult[];
  trace: AgentTrace[];
  relevantFiles: string[];
  fileChecksums: Map<string, string>;
  stepDependencies: Map<string, string[]>;
}

export interface GitHubIssue {
  url: string;
  owner: string;
  repo: string;
  issueNumber: number;
  title: string;
  body: string;
  labels: string[];
}

export interface ProjectIndex {
  files: ProjectFile[];
  directories: string[];
  totalFiles: number;
  indexedAt: string;
}

export interface ProjectFile {
  path: string;
  type: 'file' | 'directory';
  size: number;
  extension?: string;
  language?: string;
  lastModified: string;
}

export interface DependencyAnalysis {
  packageJson?: PackageDependencies;
  imports: ImportDependency[];
  dependencies: DependencyGraph;
  devDependencies?: Record<string, string>;
}

export interface PackageDependencies {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  scripts: Record<string, string>;
}

export interface ImportDependency {
  file: string;
  imports: string[];
  fromLocal: boolean;
  fromPackage: boolean;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

export interface DependencyNode {
  id: string;
  type: 'file' | 'package';
  path: string;
  metadata: Record<string, any>;
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: 'import' | 'require' | 'package';
}

export interface CodebaseSearchResult {
  matches: SearchMatch[];
  totalMatches: number;
  searchTime: number;
}

export interface SearchMatch {
  file: string;
  line: number;
  column: number;
  content: string;
  context: string[];
}
