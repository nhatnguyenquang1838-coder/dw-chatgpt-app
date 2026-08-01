import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/server.ts", import.meta.url), "utf8");

for (const required of [
  'server.registerTool("render"',
  'server.registerTool("emit_action"',
  'structuredContent: { payload }',
  'structuredContent: input',
  'window.openai?.toolOutput',
  'bridge.callTool("emit_action", args)'
]) {
  assert.ok(source.includes(required), `missing required bridge behavior: ${required}`);
}

for (const forbidden of [
  "sampleState",
  "DEFAULT_STATE",
  "approval_token",
  "buildNextStateFromAction",
  "callGGRenderer",
  "oauthSessions",
  "mcp__dw_super__github_",
  "APPROVE_G1_"
]) {
  assert.equal(source.includes(forbidden), false, `forbidden stateful behavior remains: ${forbidden}`);
}

console.log("GG pure UI bridge validation passed");
