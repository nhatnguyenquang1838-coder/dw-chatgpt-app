import server from "../src/server.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

function setCorsHeaders(res: any): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, MCP-Protocol-Version, MCP-Session-Id"
  );
  res.setHeader("Access-Control-Expose-Headers", "MCP-Protocol-Version, MCP-Session-Id");
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

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  res.on("close", () => {
    void transport.close();
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
