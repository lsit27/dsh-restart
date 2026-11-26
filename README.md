# dsh-restart

Restart the DeepSeek Harness (DSH) process from the Web UI. The restart button is placed
vertically **above the sidebar user/account button**, and its visibility can be toggled from
the small eye control next to the button (the preference persists in localStorage).

The restart keeps the currently selected default model by saving it before the process exits.

## Features

| Feature | Description |
| --- | --- |
| Vertical placement | Restart row sits immediately above the account/user button in the sidebar foot. |
| Show / hide | Hover the restart row and click the eye control to hide it; a compact restore entry remains in the same position. |
| One-click restart | `POST /dsh-restart/api/restart` closes the current DSH; a detached helper relaunches it with the same entry, arguments, cwd and environment. |
| Keeps default model | Reads and writes back `agentDefaultModel` so the new process starts with the same default model. |
| Status API | `GET /dsh-restart/api/status` returns pid, port, current model and start time. |
| Logs | `<DSH_HOME>/dsh-restart/restart.log`. |

## Install

Install from the plugin manager (GitHub source):

```text
https://github.com/lsit27/dsh-restart
```

The repo root declares a `dsh.bundle` manifest and `cordis.patch.yml`, so this works with:

```bash
dsh plugin --profile web add "https://github.com/lsit27/dsh-restart"
```

The package name matches the repository name (`dsh-restart`); installing from GitHub does not depend on npm publishing.

## Usage

1. Find the restart row directly above the user/account button at the bottom-left.
2. Click the circular-arrow button. The icon spins while the restart is requested.
3. DSH exits and is relaunched by the helper; the page refreshes when the status API is back.
4. To hide the restart button, hover the row and click the eye icon. Click the collapsed restore entry (eye-off icon) in the same place to show it again.

## API

- `GET /dsh-restart/api/status` — status of the running process.
- `POST /dsh-restart/api/restart` — request a restart (local browser session only).

## How it works

```
Client ──POST /dsh-restart/api/restart──▶ Host
                                         │ 1. save current default model
                                         │ 2. write plan-*.json
                                         │ 3. spawn(detached) restart-helper.mjs
                                         │ 4. 202, then exit
                                         ▼
                                restart-helper.mjs
                                         │ wait for old pid + port release
                                         │ spawn(node, same argv/cwd/env, detached)
                                         ▼
                                      new DSH
Client ──poll /dsh-restart/api/status──▶ reload when back
```

## Limitations

- Restarting interrupts an in-flight reply.
- If the helper process is killed externally, DSH may stay stopped; run `ollama launch dsh` to recover.
- The plugin only restarts DSH; it does not modify model or provider configuration beyond re-saving the current default model.

## License

MIT
