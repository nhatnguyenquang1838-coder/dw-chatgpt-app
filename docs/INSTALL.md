# Install / Test

## Local visual preview

```bash
npm run preview
```

Open:

```text
http://localhost:8787/preview.html
```

The preview proves responsive/mobile UI and local fallback logging.

## ChatGPT App runtime

Run the app server:

```bash
npm install
npm run dev
```

Then connect the server as a ChatGPT Apps SDK app using the current Apps SDK setup flow.

## Expected test

Ask ChatGPT:

```text
Open DW SUPER Governance Cockpit
```

Then click:

```text
Approve G1 APPROVE_G1_RHUA04_20260724
```

Expected conversation message:

```text
DW_SUPER_ACTION approve_gate
task_id: RH-UA-GWC-01
...
approval_token: APPROVE_G1_RHUA04_20260724
human_intent: approve
```
