import React from "react";
import { render, Box, Text } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { useChat } from "./use-chat";

function App() {
  const [input, setInput] = React.useState("");
  const { messages, sendMessage, status, error } = useChat();

  const isLoading = status === "streaming";

  const onSubmit = (value: string) => {
    if (!value.trim() || isLoading) return;
    sendMessage(value.trim());
    setInput("");
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Mastra TUI - Coding Agent
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {messages.map((message) => (
          <Box key={message.id} flexDirection="column" marginBottom={1}>
            <Text bold color={message.role === "user" ? "green" : "yellow"}>
              {message.role === "user" ? "You" : "Agent"}:
            </Text>
            <Box marginLeft={2} flexDirection="column">
              {message.parts.map((part, i) => {
                const key = `${message.id}-${i}`;
                switch (part.type) {
                  case "reasoning":
                    return (
                      <Box key={key} marginLeft={2}>
                        <Text dimColor italic>
                          {part.text}
                        </Text>
                      </Box>
                    );
                  case "text":
                    return <Text key={key}>{part.text}</Text>;
                  default:
                    return null;
                }
              })}
            </Box>
          </Box>
        ))}
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error.message}</Text>
        </Box>
      )}

      {isLoading && messages.at(-1)?.parts.length === 0 && (
        <Box>
          <Text color="yellow">
            <Spinner type="dots" />{" "}
          </Text>
          <Text dimColor>Thinking...</Text>
        </Box>
      )}

      <Box>
        <Text bold color="green">
          {">"}{" "}
        </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={onSubmit}
          placeholder={isLoading ? "Waiting..." : "Ask something..."}
        />
      </Box>
    </Box>
  );
}

render(<App />);
