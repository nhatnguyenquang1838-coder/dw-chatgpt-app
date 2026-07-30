export const sampleState = {
  "project": "DW SUPER",
  "task_id": "RH-UA-GWC-01",
  "run_id": "g1-20260724-0017-rental-home-ua-refresh",
  "source_instruction": "REPO",
  "execution_mode": "chat_connector_only",
  "repository": "nhatnguyenquang1838-coder/DW-SuperApps",
  "target_system": "nhatnguyenquang1838-coder/rental_home",
  "current_gate": "G1_ALIGNMENT",
  "status": "WAITING_APPROVAL",
  "risk": "R2",
  "health": 82,
  "scope_hash": "8c6dc26b45491407",
  "approval": {
    "gate": "G1_ALIGNMENT",
    "token": "APPROVE_G1_RHUA04_20260724",
    "label": "Approve G1 APPROVE_G1_RHUA04_20260724",
    "expires_at_utc": "2026-07-24T17:17:30Z"
  },
  "repositories": [
    {
      "name": "DW-SuperApps",
      "branch": "main",
      "sha": "6332c8f62614d581c45403cb5e3e0c4f528cbd70",
      "status": "verified"
    },
    {
      "name": "rental_home",
      "branch": "main",
      "sha": "88fb343c0f354661f9c2e309afe920de70b6a9a9",
      "status": "warning"
    },
    {
      "name": "gwc",
      "branch": "main",
      "sha": "b3edbb102fb5b0e7e1532e221d89c16896f17755",
      "status": "verified"
    },
    {
      "name": "Understand-Anything",
      "branch": "main",
      "sha": "6ae71878beb50226a1e4b7e2f52ac6468c86f74b",
      "status": "warning"
    }
  ],
  "risks": [
    {
      "level": "high",
      "title": "Stale governance package",
      "detail": "Generated governance packages need regeneration before execution."
    },
    {
      "level": "high",
      "title": "Old .gwc/gwc assumption",
      "detail": "Some instructions still point to nested GWC path."
    },
    {
      "level": "medium",
      "title": "UA metadata drift",
      "detail": "Existing UA graph metadata is stale against current target main."
    }
  ],
  "timeline": [
    {
      "time": "2026-07-23T17:00:00Z",
      "status": "done",
      "event": "Repository state loaded"
    },
    {
      "time": "2026-07-23T17:08:00Z",
      "status": "done",
      "event": "G0 inspection completed"
    },
    {
      "time": "2026-07-23T17:17:30Z",
      "status": "pending",
      "event": "G1 approval requested"
    }
  ],
  "github_configured": false,
  "github_repositories": [],
  "github_errors": []
} as const;
