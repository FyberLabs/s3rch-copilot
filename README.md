# s3r.ch Copilot

VS Code extension. Copilot reads the same renter view the [s3r.ch](https://s3r.ch/forum) forum already shows: the latest desktop snapshot, and the terminal and IDE lines, for channels that login can already see.

This is a draft. Install it from a VSIX. It is not published to the Marketplace.

## What Copilot sees

Copilot calls the language-model tool `s3rch_read_desk` (in chat, `#s3rchDesk`). The tool performs `GET /api/forum` on the configured forum origin (default `https://s3r.ch`).

The response already lists the caller's own channel and channels shared by a direct invite or a group membership. The tool renders `desktop` and each `shared[].desktop`:

- focused app, typed text, named keys, mouse action, MCP server and tool, the prompt, file names, and secret names
- the snapshot handle, and the PNG from `GET /api/forum?snapshot=<handle>` when the forum process is holding those bytes

`@s3rch` in Copilot chat renders that same read. A question after the view is answered by the Copilot model you already selected. `/desk` shows the view on its own.

A second read within four seconds reuses the previous response. That is the same interval the forum page uses. There is no push channel.

An address the response did not include yields nothing, and the snapshot for that address is not requested.

## What it does not do

- It does not open a visor door.
- It does not take a Hypermesh API key, and it does not send `Authorization` or an API-key header.
- It does not post to the forum.
- It does not show file bytes or secret values. Those are not on the forum read.
- It does not follow a redirect, so the session cookie stays on the origin you configured.

The PNG does not survive a forum process restart. The handle does. Until the desktop posts the pixels again, the line says there is no snapshot in this forum process.

## Install

Requires VS Code 1.106 or newer, with Copilot Chat signed in. The tool result includes the PNG, so the selected model needs to accept a PNG.

```bash
npm install
npm run package
```

That writes `s3rch-copilot-0.1.0.vsix`. In VS Code: **Extensions: Install from VSIX…**

From a checkout, **Run Extension** in the Run and Debug view starts an Extension Development Host.

## Credentials

Store one credential in VS Code Secret Storage. It is not a setting, and it is not written into the workspace.

| Command | What you paste | What is sent |
| --- | --- | --- |
| **s3r.ch: Set Forum Token** | Owner token from `POST /api/forum` with `{ "action": "token" }`, while signed in with a wallet or linked OAuth session | `x-s3rch-forum-token` |
| **s3r.ch: Set Session Cookie** | Value of the `__Host-s3rch-session` cookie from a signed-in browser (on plain HTTP, the name is `Host-s3rch-session`) | that cookie |

Setting one clears the other. **s3r.ch: Clear Credentials** drops both.

The forum token is the JWT s3r.ch already issues for a headless owner. It is not a Hypermesh API key. A missing or refused session returns nothing.

`s3rch.forumOrigin` defaults to `https://s3r.ch`. Point it at another origin only when that origin is a forum you already sign in to. The value must be an origin, with no path and no userinfo.

## Develop

```bash
npm test
npm run check
npm run compile
```

`npm test` checks the forum parse and the read: auth headers, hidden channels, snapshot handles, redirects, and the four-second cache. It does not call a live forum and it does not contain a real token.

The route this build compiles against is documented in [docs/forum.md](docs/forum.md).

Copyright Fyber Labs. This draft is not offered under an open-source license.
