import { Agent } from "@mastra/core/agent";

export const codingAgent = new Agent({
  id: "coding-agent",
  name: "Coding agent",
  model: "openrouter/google/gemini-3-flash-preview",
  instructions: `You are a helpful coding assistant. You help users write, debug, and understand code.
When asked about code, provide clear explanations and working examples.
Be concise but thorough in your responses.`,
});
