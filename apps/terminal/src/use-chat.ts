import { useState, useCallback } from "react";
import { client } from "./client";

type TextPart = { type: "text"; text: string };
type ReasoningPart = { type: "reasoning"; text: string };
export type MessagePart = TextPart | ReasoningPart;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
}

type Status = "idle" | "streaming" | "error";

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
        memory: {
          resource: "USER-ID",
          thread: "THREAD-ID",
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
