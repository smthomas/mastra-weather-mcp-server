import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { logger, createLogger } from "./logger";
import { weatherTool } from "../mastra/tools";

let server: Server;

server = new Server(
  {
    name: "Weather Tool Server",
    version: `1.0.2`,
  },
  {
    capabilities: {
      tools: {},
      logging: { enabled: true },
    },
  }
);

// Update logger with server instance
Object.assign(logger, createLogger(server));

const weatherToolInputSchema = z.object({
  location: z.string().describe("City name"),
});

// Set up request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "weatherTool",
      description: weatherTool.description,
      inputSchema: zodToJsonSchema(weatherToolInputSchema),
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const startTime = Date.now();
  try {
    let result;
    switch (request.params.name) {
      case "weatherTool": {
        const args = weatherToolInputSchema.parse(request.params.arguments);
        if (!weatherTool || !weatherTool?.execute) {
          throw new Error("weatherTool is not defined");
        }
        result = await weatherTool.execute({
          context: {
            location: args.location,
          },
          container: new Map() as any,
        });
        break;
      }
      default: {
        void logger.warning(`Unknown tool requested: ${request.params.name}`);
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${request.params.name}`,
            },
          ],
          isError: true,
        };
      }
    }

    const duration = Date.now() - startTime;
    void logger.debug(`Tool execution completed`, {
      tool: request.params.name,
      duration: `${duration}ms`,
    });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result),
        },
      ],
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    if (error instanceof z.ZodError) {
      void logger.warning("Invalid tool arguments", {
        tool: request.params.name,
        errors: error.errors,
        duration: `${duration}ms`,
      });
      return {
        content: [
          {
            type: "text",
            text: `Invalid arguments: ${error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    void logger.error(`Tool execution failed: ${request.params.name}`, error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function runServer() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    void logger.info("Started Mastra Docs MCP Server");
  } catch (error) {
    void logger.error("Failed to start server", error);
    process.exit(1);
  }
}

export { runServer, server };
