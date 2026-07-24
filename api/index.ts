import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

function createServer(): McpServer {
  const server = new McpServer({
    name: "DW SUPER Hello MCP",
    version: "1.0.0"
  });

  server.registerTool(
    "hello_dw_super",
    {
      title: "Hello DW SUPER",
      description: "Return a simple hello message to verify that ChatGPT can connect to the DW SUPER MCP server.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async () => ({
      content: [
        {
          type: "text" as const,
          text: "Hello from DW SUPER MCP. The basic MCP connection is working."
        }
      ]
    })
  );

  return server;
}

function setCorsHeaders(res: any): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, MCP-Protocol-Version, MCP-Session-Id"
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "MCP-Protocol-Version, MCP-Session-Id"
  );
  res.setHeader("Cache-Control", "no-store");
}

export default async function handler(req: any, res: any): Promise<void> {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (!req.method || !["POST", "GET", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, DELETE, OPTIONS");
    res.status(405).end();
    return;
  }

  const body =
    req.method === "POST" && typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;
  const rpcMethod = Array.isArray(body)
    ? body.map((message: { method?: string }) => message.method).join(",")
    : body?.method;
  console.log(`[mcp] ${req.method} /mcp${rpcMethod ? ` method=${rpcMethod}` : ""}`);

  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.method === "POST" ? body : undefined);
  } catch (error) {
    console.error("MCP request failed", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal MCP server error"
        },
        id: null
      });
    }
  }
}
