# HomeServer release sync

These PowerShell scripts apply the stable `sfl-site-*` GitHub Release produced by the repository workflow. They verify archive paths, the release manifest, file SHA-256 hashes, container identity, and the host build identity before recording success. Failed deployment restores the previously recorded image when one exists.

Requirements: Windows PowerShell, Docker Compose, GitHub CLI (`gh`) authenticated with read access to this repository's releases, and a `D:\HomeServer\compose.yaml` service named `sfl-simulator`. The service must use the image override below so the script can select an immutable release image:

```yaml
services:
  sfl-simulator:
    image: ${SFL_SIMULATOR_IMAGE:-homeserver-sfl-simulator:local}
    container_name: home-sfl-simulator
    profiles: [normal]
    ports:
      - "127.0.0.1:3002:3000"
```

Run `register-sfl-release-sync-task.ps1` as the desktop user to register daily checks at 03:00, 13:00 and 20:00. It skips sleeping/offline hours without waking the PC or starting a missed run at logon, and uses the user's existing GitHub and Docker sessions without administrator privileges. It writes release state under `data/app-data/sfl-deploy` and logs under `logs`. Pass `-PublicUrl` when the externally routed HomeServer URL should also be checked. The task is not registered automatically by this repository workflow.

`update-sfl-simulator.ps1` syncs the latest stable release by default. `-LocalBuild` opts into the development pipeline and optional local container build. Use `sync-sfl-release.ps1 -Rollback` for the prior stable release.

Run `register-sfl-recap-worker-task.ps1` to register two tasks: official chapter checks at 00:10 and 08:00 JST, and continuation checks at 03:00, 13:00 and 20:00. `trigger-sfl-recap-worker.ps1` reads official descriptions locally and sends changed chapters as a workflow input when dispatching one eligible section. The worker imports metadata under the same serialized writer lock as the article state, so a local cache refresh cannot overwrite a running worker's output. `-ResumeOnly` uses cached metadata except when a midnight/morning check was missed. Busy result/article writers are skipped, completed or review-only jobs are excluded, and the next tick resumes work without duplicate queued runs. The remote daily usage ledger prevents repeated runs from resetting the video budget.

The scripts need repository content-read and workflow-dispatch access for the authenticated `gh` user, plus Node.js, the app's installed dependencies, and Codex CLI signed in with ChatGPT as the desktop user (`codex login status`). Gemini video extraction and independent clip verification run in Actions. Verified writing requests are read from main and processed one at a time locally with Codex; the draft returns through a workflow input and must match the current evidence hash and pass the existing publication checks. API-key fallback is disabled and Codex authentication stays local. The CLI uses its configured default model. This shares the account's Codex allowance; it does not provide unlimited free inference.

Copy both scripts beside the other HomeServer scripts, or run them directly from this directory. Logs are written to `logs/sfl-recap-trigger.log`; the last archive check is saved in `data/app-data/sfl-recap/archive-check.json`. Drafts, JSONL usage, failure backoff and the daily 12-launch cap are saved in `data/app-data/sfl-recap/writer`. A cached draft is resent without another CLI launch. Quality failures may request up to three drafts, then pause for review. Video-budget exhaustion does not prevent submitting an already prepared draft. Actual provider-reported token counts are committed to `src/data/recap-token-usage.json`. Passed articles automatically dispatch the existing site release pipeline; the separate release-sync task applies the verified release at the next scheduled 03:00/13:00/20:00 check.
