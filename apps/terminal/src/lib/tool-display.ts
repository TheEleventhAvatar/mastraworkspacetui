function truncate(str: string, max: number): string {
  const oneLine = str.replace(/\n/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return oneLine.slice(0, max - 1) + "\u2026";
}

export function cleanToolName(name: string): string {
  return name.replace(/^mastra_workspace_/, "");
}

/** Map tool names to concise display labels */
export function toolLabel(toolName: string): string {
  const clean = cleanToolName(toolName);
  const labels: Record<string, string> = {
    execute_command: "exec",
    read_file: "read",
    write_file: "write",
    delete_file: "delete",
    list_files: "ls",
    stat: "stat",
    mkdir: "mkdir",
  };
  return labels[clean] ?? clean;
}

/** Map tool names to unicode icons */
export function toolIcon(toolName: string): string {
  const clean = cleanToolName(toolName);
  const icons: Record<string, string> = {
    execute_command: "\u25B8", // small right triangle
    read_file: "\u25A0",      // filled square
    write_file: "\u25A1",     // empty square
    delete_file: "\u2715",    // multiplication x
    list_files: "\u2502",     // vertical line
    stat: "\u2022",           // bullet
    mkdir: "\u2514",          // box draw corner
  };
  return icons[clean] ?? "\u2022";
}

export function formatToolArgs(toolName: string, args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;

  const clean = cleanToolName(toolName);
  if (clean === "execute_command") {
    const cmd = String(a.command ?? "");
    const cmdArgs = Array.isArray(a.args) ? a.args.join(" ") : "";
    return truncate(`${cmd} ${cmdArgs}`.trim(), 100);
  }
  if (
    clean === "read_file" ||
    clean === "write_file" ||
    clean === "delete_file" ||
    clean === "stat"
  ) {
    return truncate(String(a.path ?? a.filePath ?? ""), 100);
  }
  if (clean === "list_files") {
    return truncate(String(a.path ?? a.directory ?? "."), 100);
  }
  if (clean === "mkdir") {
    return truncate(String(a.path ?? ""), 100);
  }

  return truncate(JSON.stringify(a), 100);
}

export function formatToolResult(
  toolName: string,
  result: unknown,
  isError?: boolean
): string {
  if (isError) {
    const msg =
      typeof result === "object" && result !== null
        ? ((result as Record<string, unknown>).message ??
            JSON.stringify(result))
        : String(result);
    return truncate(String(msg), 120);
  }

  if (!result) return "done";

  const clean = cleanToolName(toolName);
  if (
    clean === "execute_command" &&
    typeof result === "object" &&
    result !== null
  ) {
    const r = result as Record<string, unknown>;
    const stdout = String(r.stdout ?? "").trim();
    const stderr = String(r.stderr ?? "").trim();
    const exitCode = r.exitCode ?? r.exit_code;
    if (stdout) return truncate(stdout, 120);
    if (stderr) return truncate(`stderr: ${stderr}`, 120);
    return `exit ${exitCode ?? 0}`;
  }

  if (clean === "list_files" && Array.isArray(result)) {
    const names = result.map((f: unknown) =>
      typeof f === "object" && f !== null
        ? ((f as Record<string, unknown>).name ?? String(f))
        : String(f)
    );
    return truncate(`${names.length} items`, 120);
  }

  if (typeof result === "string") return truncate(result, 120);
  return truncate(JSON.stringify(result), 120);
}
