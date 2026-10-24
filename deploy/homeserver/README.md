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

Run `register-sfl-release-sync-task.ps1` as the desktop user to register user-logon and five-minute polling. It uses the user's existing GitHub and Docker sessions without administrator privileges. It writes release state under `data/app-data/sfl-deploy` and logs under `logs`. Pass `-PublicUrl` when the externally routed HomeServer URL should also be checked. The task is not registered automatically by this repository workflow.

`update-sfl-simulator.ps1` syncs the latest stable release by default. `-LocalBuild` opts into the development pipeline and optional local container build. Use `sync-sfl-release.ps1 -Rollback` for the prior stable release.

Run `register-sfl-recap-worker-task.ps1` to register two tasks: official chapter checks at 00:10 and 08:00 JST, and a 15-minute continuation check. `trigger-sfl-recap-worker.ps1` reads official descriptions locally, updates the remote chapter cache with a SHA conflict check, then dispatches one eligible section to Actions. `-ResumeOnly` uses cached metadata except when a midnight/morning check was missed. Busy result/article writers are skipped, completed or review-only jobs are excluded, and the next tick resumes work without duplicate queued runs. The remote daily usage ledger prevents repeated runs from resetting the video budget.

The scripts need repository content-write and workflow-dispatch access for the authenticated `gh` user, plus Node.js and the app's installed dependencies. Gemini runs in Actions. Copy both scripts beside the other HomeServer scripts, or run them directly from this directory. Logs are written to `logs/sfl-recap-trigger.log`; the last archive check is saved in `data/app-data/sfl-recap/archive-check.json`. Passed articles automatically dispatch the existing site release pipeline; the separate release-sync task applies the verified release within five minutes.
