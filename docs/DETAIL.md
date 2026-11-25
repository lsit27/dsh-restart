# Restart DSH (vertical, toggleable)

Click the circular-arrow button at the bottom-left of the DSH Web UI to close and relaunch DSH.
The new process starts with the default model that was selected when you clicked.

## Where the button is

- The restart row sits **above** the sidebar user/account button (the two form a vertical stack).
  It is implemented through `sidebar.footer.action`, which the sidebar shell renders above
  `sidebar.settings` (the user button).
- Next to the restart button is a small eye control. Hover the row to reveal it:
  - Click it to **hide** the restart button. A compact eye-off restore entry stays in the same
    slot so you can show the button again.
  - The choice is saved in `localStorage` (`dsh-restart.button-visible`) and syncs across tabs.

## What happens on click

1. Client calls `POST /dsh-restart/api/restart`.
2. Host reads `agentDefaultModel.currentSelection()` (the current default model) and saves it
   back once, so the relaunched process starts with that model.
3. Host writes a restart plan to `<DSH_HOME>/dsh-restart/plan-*.json`, spawns the detached
   `restart-helper.mjs`, and returns 202.
4. The current DSH process exits.
5. The helper waits for the old process and port to go away, then relaunches DSH with the same
   node executable, argv, cwd and environment. Up to 3 attempts, 90s each.
6. The client polls `GET /dsh-restart/api/status` and reloads the page once the route is back.

## Status and logs

- `GET /dsh-restart/api/status` — pid, origin, port, current model, start time, node version,
  entry path and cwd.
- Restart log: `<DSH_HOME>/dsh-restart/restart.log` — request time, model, helper pid and each
  launch attempt.

## Requirements

- DSH Web profile (the client half targets the `web` platform).
- Node.js `^22.19.0 || >=24.0.0`.
- The Host half requires the `webServer` service to mount the API prefix route.

## Limitations

- Restarting interrupts an in-progress reply.
- The helper is a detached process. If it is killed externally (for example by killing a whole
  process tree), DSH may remain stopped; run `ollama launch dsh` to recover.
- The plugin does not change your model list or provider configuration beyond re-saving the
  current default model.

## Disable

Disable `dsh-lsit-restart` in Settings → Plugins, or remove it from the profile with
`dsh plugin --profile web remove dsh-lsit-restart`. The button and API disappear after reload.
