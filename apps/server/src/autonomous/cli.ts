#!/usr/bin/env node

import { AutonomousCoordinator } from './coordinator';
import { Task } from './types';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import path from 'path';

function printUsage() {
  console.log(chalk.blue('Autonomous Coding Agent'));
  console.log('');
  console.log('Usage:');
  console.log('  node dist/cli.js "Your task description"');
  console.log('  node dist/cli.js --issue <github-issue-url>');
  console.log('  node dist/cli.js --help');
  console.log('');
  console.log('Examples:');
  console.log('  node dist/cli.js "Create a todo list app with React"');
  console.log('  node dist/cli.js "Fix the failing test in src/tests/"');
  console.log('  node dist/cli.js "Add authentication to the API"');
}

function parseGitHubIssue(url: string): Task {
  // TODO: Implement GitHub issue parsing
  return {
    description: `Process GitHub issue: ${url}`,
    priority: 'medium',
    context: 'GitHub issue',
  };
}

export async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    printUsage();
    process.exit(0);
  }

  let task: Task;

  if (args[0] === '--issue' && args[1]) {
    task = parseGitHubIssue(args[1]);
  } else {
    task = {
      description: args.join(' '),
      priority: 'medium',
    };
  }

  console.log(chalk.blue.bold('🤖 Autonomous Coding Agent'));
  console.log(chalk.gray(`Workspace: ${process.cwd()}`));
  console.log('');

  const coordinator = new AutonomousCoordinator(process.cwd());
  
  try {
    await coordinator.executeTask(task);
  } catch (error) {
    console.log(chalk.red.bold(`\n💥 Fatal error: ${error}`));
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
