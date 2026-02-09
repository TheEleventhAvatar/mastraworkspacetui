import { Mastra } from "@mastra/core/mastra";
import { Workspace, LocalFilesystem, LocalSandbox } from "@mastra/core/workspace";
import { LibSQLStore } from "@mastra/libsql";
import { PinoLogger } from "@mastra/loggers";
import {
  CloudExporter,
  DefaultExporter,
  Observability,
  SensitiveDataFilter,
} from "@mastra/observability";
import { codingAgent } from "./agents/coding-agent";

const workspace = new Workspace({
  filesystem: new LocalFilesystem({
    basePath: "./workspace",
  }),
  sandbox: new LocalSandbox({
    workingDirectory: "./workspace",
  }),
});

export const mastra = new Mastra({
  agents: { codingAgent },
  workspace,
  storage: new LibSQLStore({
    id: "mastra-storage",
    url: "file:./mastra.db",
  }),
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: "mastra",
        exporters: [new DefaultExporter(), new CloudExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
});
