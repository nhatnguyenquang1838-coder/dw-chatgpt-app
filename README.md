# GG UI Bridge

This repository hosts a stateless ChatGPT App bridge.

## Contract

### `render(payload)`

- Returns `payload` unchanged in `structuredContent.payload`.
- Displays the payload as escaped, formatted JSON.
- Does not load, merge, infer, or persist governance state.

A payload may optionally contain UI metadata and actions:

```json
{
  "view_id": "view-123",
  "task_id": "SCRUM-123",
  "gate": "G4",
  "status": "WAITING_APPROVAL",
  "actions": [
    { "action": "approve", "label": "Approve", "kind": "primary" },
    { "action": "reject", "label": "Reject", "kind": "danger" }
  ]
}
```

The complete payload is still shown unchanged. The optional `actions` array only instructs the widget which buttons to render.

### `emit_action(view_id, task_id, gate, action)`

- Returns the four click fields to GPT.
- Does not create an approval token.
- Does not mutate, hydrate, or persist governance state.
- An approval button represents human intent only; GPT must perform any required governance validation and authorized connector operation.

## Local validation

```bash
npm ci
npm run validate:bridge
npm run typecheck
npm run build
```

## Deployment boundary

Vercel Git deployment is disabled in `vercel.json`. Merge and deployment require separate approvals.
