import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";

const server = new McpServer(
  { name: "Test", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

console.log("z type:", typeof z);
console.log("z.object type:", typeof z.object);
const schema = z.object({ test: z.string() });
console.log("schema has _def:", "_def" in schema);
console.log("schema has parse:", typeof schema.parse);

server.registerTool(
  "test_tool",
  {
    title: "Test Tool",
    description: "A test tool",
    inputSchema: z.object({ test: z.string() }),
    outputSchema: { type: "object", properties: { result: { type: "string" } } }
  },
  async (input) => ({
    structuredContent: { result: `Got: ${input.test}` },
    content: [{ type: "text", text: `Got: ${input.test}` }]
  })
);

console.log("SUCCESS: Tool registered without errors");