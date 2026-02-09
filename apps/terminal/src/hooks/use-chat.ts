import { useState, useCallback } from "react";
import { client } from "../lib/client";

type TextPart = { type: "text"; text: string };
type ReasoningPart = { type: "reasoning"; text: string };
type ToolCallPart = {
  type: "tool-call";
  toolName: string;
  toolCallId: string;
  args?: unknown;
};
type ToolResultPart = {
  type: "tool-result";
  toolName: string;
  toolCallId: string;
  result: unknown;
  isError?: boolean;
};
export type MessagePart =
  | TextPart
  | ReasoningPart
  | ToolCallPart
  | ToolResultPart;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
}

type Status = "idle" | "streaming" | "error";


// TODO: Generating thread/resource IDs on the client is bad practice.
// This is for demo purposes only — in production, IDs should come from the server.
const threadId = crypto.randomUUID();

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<Error | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text }],
    };

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      parts: [],
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStatus("streaming");
    setError(null);

    try {
      const agent = client.getAgent("coding-agent");
      const stream = await agent.stream(text, {
        maxSteps: 999,
        memory: {
          resource: "USER_ID",
          thread: threadId,
        },
      });

      await stream.processDataStream({
        onChunk: async (chunk) => {
          switch (chunk.type) {
            case "text-delta": {
              setMessages((prev) => {
                const updated = [...prev];
                const last = { ...updated[updated.length - 1] };
                const parts = [...last.parts];

                const lastPart = parts[parts.length - 1];
                if (lastPart && lastPart.type === "text") {
                  parts[parts.length - 1] = {
                    ...lastPart,
                    text: lastPart.text + chunk.payload.text,
                  };
                } else {
                  parts.push({ type: "text", text: chunk.payload.text });
                }

                last.parts = parts;
                updated[updated.length - 1] = last;
                return updated;
              });
              break;
            }
            case "reasoning-delta": {
              setMessages((prev) => {
                const updated = [...prev];
                const last = { ...updated[updated.length - 1] };
                const parts = [...last.parts];

                const lastPart = parts[parts.length - 1];
                if (lastPart && lastPart.type === "reasoning") {
                  parts[parts.length - 1] = {
                    ...lastPart,
                    text: lastPart.text + chunk.payload.text,
                  };
                } else {
                  parts.push({ type: "reasoning", text: chunk.payload.text });
                }

                last.parts = parts;
                updated[updated.length - 1] = last;
                return updated;
              });
              break;
            }
            case "error": {
              setError(new Error(String(chunk.payload)));
              break;
            }
            case "tool-call": {
              setMessages((prev) => {
                const updated = [...prev];
                const last = { ...updated[updated.length - 1] };
                const parts = [...last.parts];
                parts.push({
                  type: "tool-call",
                  toolName: chunk.payload.toolName,
                  toolCallId: chunk.payload.toolCallId,
                  args: chunk.payload.args,
                });
                last.parts = parts;
                updated[updated.length - 1] = last;
                return updated;
              });
              break;
            }
            case "tool-result": {
              setMessages((prev) => {
                const updated = [...prev];
                const last = { ...updated[updated.length - 1] };
                const parts = [...last.parts];
                parts.push({
                  type: "tool-result",
                  toolName: chunk.payload.toolName,
                  toolCallId: chunk.payload.toolCallId,
                  result: chunk.payload.result,
                  isError: chunk.payload.isError,
                });
                last.parts = parts;
                updated[updated.length - 1] = last;
                return updated;
              });
              break;
            }
            case "tool-error": {
              setMessages((prev) => {
                const updated = [...prev];
                const last = { ...updated[updated.length - 1] };
                const parts = [...last.parts];
                parts.push({
                  type: "tool-result",
                  toolName: chunk.payload.toolName,
                  toolCallId: chunk.payload.toolCallId,
                  result: chunk.payload.error,
                  isError: true,
                });
                last.parts = parts;
                updated[updated.length - 1] = last;
                return updated;
              });
              break;
            }
          }
        },
      });

      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setStatus("error");
    }
  }, []);

  return { messages, sendMessage, status, error };
}
