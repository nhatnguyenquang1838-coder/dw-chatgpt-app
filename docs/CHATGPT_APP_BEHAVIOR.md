# ChatGPT App Behavior

## What the button does

A button in the DW SUPER widget sends a message into the current ChatGPT conversation using the Apps bridge method:

```json
{
  "jsonrpc": "2.0",
  "method": "ui/message",
  "params": {
    "role": "user",
    "content": [
      {
        "type": "text",
        "text": "DW_SUPER_ACTION approve_gate ..."
      }
    ]
  }
}
```

## What it does not do

It does not directly:

- merge PRs
- write repository files
- approve a real GWC gate
- write audit records
- send Slack messages

Those actions still require tools/connectors and evidence.

## Approval button convention

The approval token is visible inside the button label.

Example:

```text
Approve G1 APPROVE_G1_RHUA04_20260724
```

Clicking it means:

```text
human_intent: approve
approval_token: APPROVE_G1_RHUA04_20260724
```

The assistant should then continue the governance workflow according to project instructions.
