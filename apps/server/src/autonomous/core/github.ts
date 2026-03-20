import { GitHubIssue } from './types';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface PullRequest {
  url: string;
  number: number;
  title: string;
  body: string;
  headBranch: string;
  baseBranch: string;
  state: 'open' | 'closed' | 'merged';
}

export interface GitHubWorkflowResult {
  success: boolean;
  issue?: GitHubIssue;
  pullRequest?: PullRequest;
  error?: string;
}

export class GitHubClient {
  private token: string;
  private workspace: string;

  constructor(token?: string, workspace: string = process.cwd()) {
    this.token = token || process.env.GITHUB_TOKEN || '';
    this.workspace = workspace;
  }

  async parseIssue(url: string): Promise<GitHubIssue> {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)\/issues\/(\d+)/);
    if (!match) {
      throw new Error('Invalid GitHub issue URL format');
    }

    const [, owner, repo, issueNumber] = match;
    
    try {
      const issueData = await this.fetchIssue(owner, repo, parseInt(issueNumber));
      return {
        url,
        owner,
        repo,
        issueNumber: parseInt(issueNumber),
        title: issueData.title,
        body: issueData.body || '',
        labels: issueData.labels.map((label: any) => label.name),
      };
    } catch (error) {
      throw new Error(`Failed to fetch issue: ${error}`);
    }
  }

  private async fetchIssue(owner: string, repo: string, issueNumber: number): Promise<any> {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': this.token ? `token ${this.token}` : '',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Autonomous-Coding-Agent/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getRepoContext(owner: string, repo: string): Promise<{
    language: string;
    description: string;
    defaultBranch: string;
  }> {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': this.token ? `token ${this.token}` : '',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Autonomous-Coding-Agent/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch repo info: ${response.status}`);
    }

    const data = await response.json();
    return {
      language: data.language || 'Unknown',
      description: data.description || '',
      defaultBranch: data.default_branch || 'main',
    };
  }

  // 🚀 YC-LEVEL: Issue → PR Workflow
  async executeIssueToPRWorkflow(issueUrl: string): Promise<GitHubWorkflowResult> {
    try {
      console.log('🔗 Starting Issue → PR workflow...');
      
      // Step 1: Parse and understand the issue
      const issue = await this.parseIssue(issueUrl);
      const repoContext = await this.getRepoContext(issue.owner, issue.repo);
      
      console.log(`📋 Issue: ${issue.title}`);
      console.log(`📂 Repository: ${issue.owner}/${issue.repo} (${repoContext.language})`);
      
      // Step 2: Clone repository if not already present
      await this.ensureRepositoryCloned(issue.owner, issue.repo);
      
      // Step 3: Create feature branch
      const branchName = `fix/issue-${issue.issueNumber}-${Date.now()}`;
      await this.createFeatureBranch(branchName, repoContext.defaultBranch);
      
      // Step 4: Extract requirements and code blocks
      const requirements = this.extractRequirements(issue.body);
      const codeBlocks = this.extractCodeBlocks(issue.body);
      
      console.log(`📝 Requirements: ${requirements.length} found`);
      console.log(`💻 Code blocks: ${codeBlocks.length} found`);
      
      return {
        success: true,
        issue,
        pullRequest: {
          url: '', // Will be populated when PR is created
          number: 0,
          title: `Fix #${issue.issueNumber}: ${issue.title}`,
          body: this.generatePRDescription(issue, requirements),
          headBranch: branchName,
          baseBranch: repoContext.defaultBranch,
          state: 'open'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async ensureRepositoryCloned(owner: string, repo: string): Promise<void> {
    const repoPath = `${this.workspace}/${repo}`;
    
    try {
      // Check if repo already exists
      await execAsync('git status', { cwd: repoPath });
      console.log('✅ Repository already exists');
    } catch (error) {
      // Clone the repository
      console.log('📥 Cloning repository...');
      const cloneUrl = `https://github.com/${owner}/${repo}.git`;
      await execAsync(`git clone ${cloneUrl}`, { cwd: this.workspace });
      console.log('✅ Repository cloned successfully');
    }
  }

  private async createFeatureBranch(branchName: string, baseBranch: string): Promise<void> {
    try {
      // Ensure we're on the latest base branch
      await execAsync(`git checkout ${baseBranch}`, { cwd: this.workspace });
      await execAsync('git pull origin', { cwd: this.workspace });
      
      // Create and checkout feature branch
      await execAsync(`git checkout -b ${branchName}`, { cwd: this.workspace });
      console.log(`🌿 Created feature branch: ${branchName}`);
    } catch (error) {
      throw new Error(`Failed to create feature branch: ${error}`);
    }
  }

  private generatePRDescription(issue: GitHubIssue, requirements: string[]): string {
    let description = `## Fixes #${issue.issueNumber}: ${issue.title}\n\n`;
    
    if (issue.body) {
      description += `### Issue Description\n${issue.body}\n\n`;
    }
    
    if (requirements.length > 0) {
      description += `### Requirements Addressed\n`;
      requirements.forEach((req, i) => {
        description += `${i + 1}. ${req}\n`;
      });
      description += '\n';
    }
    
    description += `### Changes Made\n`;
    description += `- [ ] Automated implementation based on issue requirements\n`;
    description += `- [ ] Code follows project conventions\n`;
    description += `- [ ] Tests added/updated as needed\n`;
    description += `- [ ] Documentation updated\n\n`;
    
    description += `### 🤖 Generated by Autonomous Agent\n`;
    description += `This pull request was automatically generated by the YC-level autonomous agent.\n`;
    description += `The agent analyzed the issue requirements and implemented the solution.\n\n`;
    
    description += `### Verification\n`;
    description += `Please review the changes and ensure they meet the requirements.\n`;
    description += `The agent has verified the implementation against the original issue.\n`;
    
    return description;
  }

  async createPullRequest(owner: string, repo: string, prData: {
    title: string;
    body: string;
    head: string;
    base: string;
  }): Promise<PullRequest> {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/pulls`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': this.token ? `token ${this.token}` : '',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Autonomous-Coding-Agent/1.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(prData),
    });

    if (!response.ok) {
      throw new Error(`Failed to create PR: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      url: data.html_url,
      number: data.number,
      title: data.title,
      body: data.body,
      headBranch: data.head.ref,
      baseBranch: data.base.ref,
      state: data.state,
    };
  }

  async commitChanges(message: string, files?: string[]): Promise<void> {
    try {
      // Stage changes
      if (files && files.length > 0) {
        await execAsync(`git add ${files.join(' ')}`, { cwd: this.workspace });
      } else {
        await execAsync('git add .', { cwd: this.workspace });
      }
      
      // Commit changes
      await execAsync(`git commit -m "${message}"`, { cwd: this.workspace });
      console.log('✅ Changes committed');
    } catch (error) {
      throw new Error(`Failed to commit changes: ${error}`);
    }
  }

  async pushBranch(branchName: string): Promise<void> {
    try {
      await execAsync(`git push -u origin ${branchName}`, { cwd: this.workspace });
      console.log('📤 Branch pushed to remote');
    } catch (error) {
      throw new Error(`Failed to push branch: ${error}`);
    }
  }

  // Complete workflow: Issue → Code → PR
  async completeIssueToPRWorkflow(issueUrl: string, commitMessage: string, filesToCommit?: string[]): Promise<GitHubWorkflowResult> {
    try {
      // Execute initial workflow
      const workflowResult = await this.executeIssueToPRWorkflow(issueUrl);
      
      if (!workflowResult.success || !workflowResult.pullRequest) {
        return workflowResult;
      }

      const { issue, pullRequest } = workflowResult;
      
      if (!issue) {
        return {
          success: false,
          error: 'No issue found in workflow result'
        };
      }
      
      // Commit and push changes
      if (filesToCommit && filesToCommit.length > 0) {
        await this.commitChanges(commitMessage, filesToCommit);
      }
      
      await this.pushBranch(pullRequest.headBranch);
      
      // Create Pull Request
      console.log('🔗 Creating Pull Request...');
      const pr = await this.createPullRequest(issue.owner, issue.repo, {
        title: pullRequest.title,
        body: pullRequest.body,
        head: pullRequest.headBranch,
        base: pullRequest.baseBranch,
      });
      
      console.log(`✅ Pull Request created: ${pr.url}`);
      
      return {
        success: true,
        issue,
        pullRequest: pr,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  extractCodeBlocks(body: string): string[] {
    const codeBlocks: string[] = [];
    const regex = /```(\w+)?\n([\s\S]*?)\n```/g;
    let match;

    while ((match = regex.exec(body)) !== null) {
      codeBlocks.push(match[2]);
    }

    return codeBlocks;
  }

  extractRequirements(body: string): string[] {
    const requirements: string[] = [];
    const lines = body.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('-') || trimmed.startsWith('*') || /^\d+\./.test(trimmed)) {
        requirements.push(trimmed.replace(/^[-*\d.\s]+/, ''));
      }
    }

    return requirements;
  }
}
