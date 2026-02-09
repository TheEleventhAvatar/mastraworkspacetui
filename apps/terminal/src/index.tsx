import React from "react";
import { render, Box, Text } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { useChat } from "./hooks/use-chat";
import type { MessagePart } from "./hooks/use-chat";
import {
  cleanToolName,
  formatToolArgs,
  formatToolResult,
  toolLabel,
  toolIcon,
} from "./lib/tool-display";

// ── Color palette (muted dev-tool aesthetic) ──────────────────────────
const C = {
  // grays
  fg: "#c8c8c8",
  dim: "#666666",
  dimmer: "#444444",
  border: "#3a3a3a",
  subtle: "#888888",
  // accents (desaturated)
  accent: "#7aa2f7",
  user: "#9ece6a",
  tool: "#bb9af7",
  result: "#73daca",
  error: "#f7768e",
  warn: "#e0af68",
  reasoning: "#565f89",
} as const;

// ── Box-drawing pieces ────────────────────────────────────────────────
const LINE_H = "\u2500";
const CORNER_TL = "\u256D";
const CORNER_BL = "\u2570";
const PIPE = "\u2502";
const DOT = "\u2022";
const ARROW = "\u276F";
const TRI = "\u25B8";

// ── Divider ───────────────────────────────────────────────────────────
function Divider({ width = 60 }: { width?: number }) {
  return (
    <Box>
      <Text color={C.border}>{LINE_H.repeat(width)}</Text>
    </Box>
  );
}

// ── Header ────────────────────────────────────────────────────────────
function Header({ status }: { status: string }) {
  const statusDot = status === "streaming" ? C.warn : C.dim;
  const statusText = status === "streaming" ? "streaming" : "ready";
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={C.accent} bold>
          mastra
        </Text>
        <Text color={C.dim}> tui </Text>
        <Text color={C.dimmer}>v0.0.1</Text>
        <Text color={C.dim}> {DOT} </Text>
        <Text color={statusDot}>{DOT}</Text>
        <Text color={C.dim}> {statusText}</Text>
      </Box>
      <Box marginTop={0}>
        <Text color={C.dimmer} dimColor>
          coding agent {DOT} type a message to begin
        </Text>
      </Box>
      <Box marginTop={1}>
        <Divider />
      </Box>
    </Box>
  );
}

// ── Welcome (empty state) ─────────────────────────────────────────────
function Welcome() {
  return (
    <Box flexDirection="column" paddingY={1}>
      <Box>
        <Text color={C.dim}>
          {CORNER_TL}{LINE_H}{LINE_H} No messages yet
        </Text>
      </Box>
      <Box>
        <Text color={C.dim}>
          {PIPE}
        </Text>
      </Box>
      <Box>
        <Text color={C.dim}>
          {PIPE}  Ask the agent to explore a repo, write code,
        </Text>
      </Box>
      <Box>
        <Text color={C.dim}>
          {PIPE}  run commands, or answer questions about a codebase.
        </Text>
      </Box>
      <Box>
        <Text color={C.dim}>
          {PIPE}
        </Text>
      </Box>
      <Box>
        <Text color={C.dim}>
          {CORNER_BL}{LINE_H}{LINE_H} Start by typing below
        </Text>
      </Box>
    </Box>
  );
}

// ── Reasoning block ───────────────────────────────────────────────────
function ReasoningBlock({ text }: { text: string }) {
  const lines = text.split("\n").filter(Boolean);
  return (
    <Box flexDirection="column" marginLeft={3}>
      <Text color={C.reasoning} dimColor italic>
        {PIPE} thinking{"\u2026"}
      </Text>
      {lines.slice(-4).map((line, i) => (
        <Text key={i} color={C.reasoning} dimColor italic>
          {PIPE} {line.length > 90 ? line.slice(0, 89) + "\u2026" : line}
        </Text>
      ))}
    </Box>
  );
}

// ── Tool call block ───────────────────────────────────────────────────
function ToolCallBlock({
  toolName,
  args,
}: {
  toolName: string;
  args?: unknown;
}) {
  const label = toolLabel(toolName);
  const icon = toolIcon(toolName);
  const argsStr = formatToolArgs(toolName, args);

  return (
    <Box marginLeft={3}>
      <Text color={C.dimmer}>{icon} </Text>
      <Text color={C.tool}>{label}</Text>
      {argsStr ? (
        <Text color={C.subtle}> {argsStr}</Text>
      ) : null}
    </Box>
  );
}

// ── Tool result block ─────────────────────────────────────────────────
function ToolResultBlock({
  toolName,
  result,
  isError,
}: {
  toolName: string;
  result: unknown;
  isError?: boolean;
}) {
  const text = formatToolResult(toolName, result, isError);
  if (isError) {
    return (
      <Box marginLeft={5}>
        <Text color={C.error}>{TRI} {text}</Text>
      </Box>
    );
  }
  return (
    <Box marginLeft={5}>
      <Text color={C.dimmer}>{TRI} </Text>
      <Text color={C.dim}>{text}</Text>
    </Box>
  );
}

// ── Text block ────────────────────────────────────────────────────────
function TextBlock({ text }: { text: string }) {
  return (
    <Box marginLeft={3}>
      <Text color={C.fg}>{text}</Text>
    </Box>
  );
}

// ── Single message ────────────────────────────────────────────────────
function MessageView({
  role,
  parts,
}: {
  role: "user" | "assistant";
  parts: MessagePart[];
}) {
  const isUser = role === "user";

  return (
    <Box flexDirection="column" marginBottom={0}>
      {/* Role label */}
      <Box>
        <Text color={isUser ? C.user : C.accent} bold>
          {isUser ? ARROW : DOT}
        </Text>
        <Text color={isUser ? C.user : C.accent} bold>
          {" "}
          {isUser ? "you" : "agent"}
        </Text>
      </Box>

      {/* Parts */}
      {parts.map((part, i) => {
        const key = `${i}`;
        switch (part.type) {
          case "reasoning":
            return <ReasoningBlock key={key} text={part.text} />;
          case "text":
            return <TextBlock key={key} text={part.text} />;
          case "tool-call":
            return (
              <ToolCallBlock
                key={key}
                toolName={part.toolName}
                args={part.args}
              />
            );
          case "tool-result":
            return (
              <ToolResultBlock
                key={key}
                toolName={part.toolName}
                result={part.result}
                isError={part.isError}
              />
            );
          default:
            return null;
        }
      })}
    </Box>
  );
}

// ── Error display ─────────────────────────────────────────────────────
function ErrorBanner({ message }: { message: string }) {
  return (
    <Box
      borderStyle="round"
      borderColor={C.error}
      paddingX={1}
      marginBottom={1}
    >
      <Text color={C.error} bold>
        error
      </Text>
      <Text color={C.dim}> {DOT} </Text>
      <Text color={C.fg}>{message}</Text>
    </Box>
  );
}

// ── Loading indicator ─────────────────────────────────────────────────
function LoadingIndicator() {
  return (
    <Box marginLeft={3}>
      <Text color={C.dim}>
        <Spinner type="dots" />
      </Text>
    </Box>
  );
}

// ── Input prompt ──────────────────────────────────────────────────────
function InputPrompt({
  input,
  isLoading,
  onChange,
  onSubmit,
}: {
  input: string;
  isLoading: boolean;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
}) {
  return (
    <Box flexDirection="column">
      <Divider />
      <Box marginTop={1}>
        <Text color={isLoading ? C.dim : C.accent}>{ARROW} </Text>
        {input === "" && !isLoading ? (
          <>
            <TextInput value={input} onChange={onChange} onSubmit={onSubmit} />
            <Text color={C.dimmer}>ask something{"\u2026"}</Text>
          </>
        ) : isLoading && input === "" ? (
          <>
            <TextInput value={input} onChange={onChange} onSubmit={onSubmit} />
            <Text color={C.dimmer}>waiting{"\u2026"}</Text>
          </>
        ) : (
          <TextInput value={input} onChange={onChange} onSubmit={onSubmit} />
        )}
      </Box>
    </Box>
  );
}

// ── App ───────────────────────────────────────────────────────────────
function App() {
  const [input, setInput] = React.useState("");
  const { messages, sendMessage, status, error } = useChat();

  const isLoading = status === "streaming";

  const onSubmit = (value: string) => {
    if (!value.trim() || isLoading) return;
    sendMessage(value.trim());
    setInput("");
  };

  const hasMessages = messages.length > 0;
  const showLoading =
    isLoading && messages.at(-1)?.parts.length === 0;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {/* Header */}
      <Header status={status} />

      {/* Messages or welcome */}
      <Box flexDirection="column" marginY={1} gap={1}>
        {hasMessages ? (
          messages.map((message) => (
            <MessageView
              key={message.id}
              role={message.role}
              parts={message.parts}
            />
          ))
        ) : (
          <Welcome />
        )}
      </Box>

      {/* Loading */}
      {showLoading && <LoadingIndicator />}

      {/* Error */}
      {error && <ErrorBanner message={error.message} />}

      {/* Input */}
      <InputPrompt
        input={input}
        isLoading={isLoading}
        onChange={setInput}
        onSubmit={onSubmit}
      />
    </Box>
  );
}

render(<App />);
