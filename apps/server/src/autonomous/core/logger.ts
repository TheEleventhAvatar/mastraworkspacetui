import { AgentTrace, AgentState } from './types';

export class AgentLogger {
  private traces: AgentTrace[] = [];
  private state: AgentState;

  constructor(state: AgentState) {
    this.state = state;
  }

  log(level: AgentTrace['level'], agent: string, stepId: string, message: string, metadata?: Record<string, any>): void {
    const trace: AgentTrace = {
      timestamp: new Date().toISOString(),
      level,
      agent,
      stepId,
      message,
      metadata,
    };

    this.traces.push(trace);
    this.state.trace.push(trace);

    // Console output with formatting
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${agent}]`;
    
    switch (level) {
      case 'debug':
        console.debug(`${prefix} ${message}`);
        break;
      case 'info':
        console.info(`${prefix} ${message}`);
        break;
      case 'warn':
        console.warn(`${prefix} ${message}`);
        break;
      case 'error':
        console.error(`${prefix} ${message}`);
        break;
    }
  }

  debug(agent: string, stepId: string, message: string, metadata?: Record<string, any>): void {
    this.log('debug', agent, stepId, message, metadata);
  }

  info(agent: string, stepId: string, message: string, metadata?: Record<string, any>): void {
    this.log('info', agent, stepId, message, metadata);
  }

  warn(agent: string, stepId: string, message: string, metadata?: Record<string, any>): void {
    this.log('warn', agent, stepId, message, metadata);
  }

  error(agent: string, stepId: string, message: string, metadata?: Record<string, any>): void {
    this.log('error', agent, stepId, message, metadata);
  }

  getTraces(): AgentTrace[] {
    return [...this.traces];
  }

  getTraceForStep(stepId: string): AgentTrace[] {
    return this.traces.filter(trace => trace.stepId === stepId);
  }

  exportTrace(): string {
    return JSON.stringify(this.traces, null, 2);
  }

  clear(): void {
    this.traces = [];
    this.state.trace = [];
  }
}
