function truncate(str: string, max: number): string {
  const oneLine = str.replace(/\n/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return oneLine.slice(0, max - 3) + "...";
}

export function cleanToolName(name: string): string {
  return name.replace(/^mastra_workspace_/, "");
}

export function formatToolArgs(toolName: string, args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;

  const clean = cleanToolName(toolName);
  if (clean === "execute_command") {
    const cmd = String(a.command ?? "");
    const cmdArgs = Array.isArray(a.args) ? a.args.join(" ") : "";
    return truncate(`${cmd} ${cmdArgs}`.trim(), 80);
  }
  if (clean === "read_file" || clean === "write_file" || clean === "delete_file" || clean === "stat") {
    return truncate(String(a.path ?? a.filePath ?? ""), 80);
  }
  if (clean === "list_files") {
    return truncate(String(a.path ?? a.directory ?? "."), 80);
  }
  if (clean === "mkdir") {
    return truncate(String(a.path ?? ""), 80);
  }

  return truncate(JSON.stringify(a), 80);
}

export function formatToolResult(toolName: string, result: unknown, isError?: boolean): string {
  if (isError) {
    const msg = typeof result === "object" && result !== null
      ? (result as Record<string, unknown>).message ?? JSON.stringify(result)
      : String(result);
    return truncate(`Error: ${msg}`, 120);
  }

  if (!result) return "done";

  const clean = cleanToolName(toolName);
  if (clean === "execute_command" && typeof result === "object" && result !== null) {
    const r = result as Record<string, unknown>;
    const stdout = String(r.stdout ?? "").trim();
    const stderr = String(r.stderr ?? "").trim();
    const exitCode = r.exitCode ?? r.exit_code;
    if (stdout) return truncate(stdout, 120);
    if (stderr) return truncate(`stderr: ${stderr}`, 120);
    return `exit code: ${exitCode ?? 0}`;
  }

  if (clean === "list_files" && Array.isArray(result)) {
    const names = result.map((f: unknown) =>
      typeof f === "object" && f !== null ? (f as Record<string, unknown>).name ?? String(f) : String(f)
    );
    return truncate(`${names.join(", ")} (${names.length} items)`, 120);
  }

  if (typeof result === "string") return truncate(result, 120);
  return truncate(JSON.stringify(result), 120);
}
