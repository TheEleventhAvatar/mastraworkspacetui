#!/usr/bin/env node

import { ProductionCoordinator } from './autonomous/core/coordinator-v2';
import { TaskInput } from './autonomous/core/types';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

function printUsage() {
  console.log(chalk.blue.bold('🤖 Production Autonomous Agent'));
  console.log('');
  console.log(chalk.gray('YC Startup Prototype - Real-world autonomous engineering'));
  console.log('');
  console.log('Usage:');
  console.log('  node dist/autonomous-cli-v2.js "Your task description"');
  console.log('  node dist/autonomous-cli-v2.js --issue <github-issue-url>');
  console.log('  node dist/autonomous-cli-v2.js --help');
  console.log('');
  console.log('Options:');
  console.log('  --priority <low|medium|high>    Task priority (default: medium)');
  console.log('  --max-steps <number>          Maximum steps to execute (default: 20)');
  console.log('  --context <string>            Additional context for the task');
  console.log('');
  console.log('Examples:');
  console.log('  node dist/autonomous-cli-v2.js "Add authentication to the API"');
  console.log('  node dist/autonomous-cli-v2.js "Fix failing tests in src/tests/" --priority high');
  console.log('  node dist/autonomous-cli-v2.js --issue https://github.com/user/repo/issues/123');
}

function parseArguments(): TaskInput | null {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    printUsage();
    return null;
  }

  const taskInput: TaskInput = {
    description: '',
    priority: 'medium',
    maxSteps: 20,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    
    switch (arg) {
      case '--issue':
        if (i + 1 < args.length) {
          taskInput.githubIssue = args[i + 1];
          taskInput.description = `Process GitHub issue: ${args[i + 1]}`;
          i += 2;
        } else {
          console.error(chalk.red('Error: --issue requires a URL'));
          return null;
        }
        break;
        
      case '--priority':
        if (i + 1 < args.length) {
          const priority = args[i + 1];
          if (['low', 'medium', 'high'].includes(priority)) {
            taskInput.priority = priority as any;
          } else {
            console.error(chalk.red('Error: Priority must be low, medium, or high'));
            return null;
          }
          i += 2;
        } else {
          console.error(chalk.red('Error: --priority requires a value'));
          return null;
        }
        break;
        
      case '--max-steps':
        if (i + 1 < args.length) {
          const steps = parseInt(args[i + 1]);
          if (isNaN(steps) || steps < 1 || steps > 50) {
            console.error(chalk.red('Error: --max-steps must be between 1 and 50'));
            return null;
          }
          taskInput.maxSteps = steps;
          i += 2;
        } else {
          console.error(chalk.red('Error: --max-steps requires a number'));
          return null;
        }
        break;
        
      case '--context':
        if (i + 1 < args.length) {
          taskInput.context = args[i + 1];
          i += 2;
        } else {
          console.error(chalk.red('Error: --context requires a value'));
          return null;
        }
        break;
        
      default:
        if (!arg.startsWith('--')) {
          taskInput.description = arg;
          i++;
        } else {
          console.error(chalk.red(`Error: Unknown option ${arg}`));
          return null;
        }
    }
  }

  if (!taskInput.description && !taskInput.githubIssue) {
    console.error(chalk.red('Error: Must provide either a task description or --issue URL'));
    return null;
  }

  return taskInput;
}

async function main() {
  const taskInput = parseArguments();
  if (!taskInput) {
    process.exit(1);
  }

  console.log(chalk.blue.bold('🚀 Starting Production Autonomous Agent'));
  console.log(chalk.gray(`Workspace: ${process.cwd()}`));
  console.log(chalk.gray(`Priority: ${taskInput.priority}`));
  console.log(chalk.gray(`Max Steps: ${taskInput.maxSteps}`));
  
  if (taskInput.githubIssue) {
    console.log(chalk.blue(`📋 Processing GitHub Issue: ${taskInput.githubIssue}`));
  }
  
  console.log('');

  const startTime = Date.now();
  const coordinator = new ProductionCoordinator(process.cwd());
  
  try {
    await coordinator.executeTask(taskInput);
    
    const duration = Date.now() - startTime;
    const summary = coordinator.getExecutionSummary();
    
    console.log('');
    console.log(chalk.green.bold('📊 Execution Summary:'));
    console.log(chalk.gray(`  Total Steps: ${summary.totalSteps}`));
    console.log(chalk.gray(`  Executed Steps: ${summary.executedSteps}`));
    console.log(chalk.gray(`  Success Rate: ${Math.round(summary.successRate * 100)}%`));
    console.log(chalk.gray(`  Duration: ${Math.round(duration / 1000)}s`));
    console.log(chalk.gray(`  Files Changed: ${summary.filesChanged.length}`));
    
  } catch (error) {
    console.log('');
    console.log(chalk.red.bold('💥 Fatal Error:'));
    console.log(chalk.red(error instanceof Error ? error.message : String(error)));
    
    const duration = Date.now() - startTime;
    const summary = coordinator.getExecutionSummary();
    
    console.log('');
    console.log(chalk.yellow('📊 Partial Summary:'));
    console.log(chalk.gray(`  Steps Attempted: ${summary.executedSteps}`));
    console.log(chalk.gray(`  Duration: ${Math.round(duration / 1000)}s`));
    
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('Unhandled error:'), error);
    process.exit(1);
  });
}
