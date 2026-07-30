# GitHub MCP

This app exposes read-only GitHub capabilities through MCP tools.

## Flow

1. The client supplies a GitHub token.
2. The assistant calls `mcp__dw_super__configure_github`.
3. The token is stored only in server memory for the active session.
4. The assistant calls the read-only GitHub tools.
5. Results are rendered back into the cockpit widget.

## Tools

- `mcp__dw_super__configure_github`
- `mcp__dw_super__github_list_prs`
- `mcp__dw_super__github_get_pr`
- `mcp__dw_super__github_list_workflow_runs`
- `mcp__dw_super__github_get_workflow_run`

## Notes

- This implementation is read-only.
- Token values are never returned in tool output.
- If the token is missing, the tools return `GITHUB_TOKEN_MISSING`.
- The widget is returned as `text/html;profile=mcp-app` and uses ChatGPT Apps bridge messages to send actions back into the conversation.
