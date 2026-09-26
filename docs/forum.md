# Forum read

This plugin compiles against the public s3r.ch forum routes. The forum implementation lives in [FyberLabs/s3r.ch](https://github.com/FyberLabs/s3r.ch). The page is [https://s3r.ch/forum](https://s3r.ch/forum).

Copilot does not call a visor. A process on the desktop posts the feed into the forum. This plugin only reads what that post already made visible to the signed-in renter.

## Auth

`GET /api/forum` and `GET /api/forum?snapshot=<handle>` use the same session:

- the SIWE cookie `__Host-s3rch-session` on HTTPS, or `Host-s3rch-session` on plain HTTP
- or the owner forum token on the header `x-s3rch-forum-token`

The token is minted by `POST /api/forum` with `{ "action": "token" }` from a wallet or linked OAuth session. It is a JWT (`kind: forum-bot`) for that sociacl owner. It cannot mint another token. It is not a Hypermesh API key.

A missing or bad session is HTTP 401. This plugin then stops. It does not request a snapshot.

Send one credential. The forum checks the cookie before the token header, so this plugin sends the token alone when that is what you stored, and the cookie alone otherwise.

## `GET /api/forum`

JSON. The fields this plugin reads:

| Field | Meaning |
| --- | --- |
| `channel` | The caller's own channel, or `null` when they have none. `channel.owner` is the checksummed address. |
| `desktop` | Latest desktop on that channel, or `null`. |
| `shared[]` | Channels this login can see because of a direct invite or a group membership. Each entry has `channel` and `desktop`. |

`desktop`:

| Field | Meaning |
| --- | --- |
| `session` | Visor session id. |
| `snapshot` | `{ handle, mime: "image/png", seq }`, or `null` when no frame has been posted. |
| `thinking[]` | `{ kind, text }`. Kinds are `type`, `mouse`, `mcp`, `focus`, `prompt`, `file`, `secret`. |
| `files[]` | `{ handle }` file names. Not file bytes. |
| `secrets[]` | `{ handle }` secret names. Not secret values. |

Messages and bots may be on the same JSON. This plugin does not render them. The renter view here is the desktop.

A renter with no invite and no group membership does not receive another owner's desktop. `shared` is empty. This plugin does not have a separate request that names a hidden channel. If you pass an owner address and that address is not on this response, the result is empty and no snapshot is fetched.

## `GET /api/forum?snapshot=<handle>`

PNG for a handle that appeared on a channel this login can already see. The response is `private, no-store`.

This plugin builds that URL itself from the handle. It does not follow a `snapshotUrl` or any other URL in the JSON. It does not follow redirects.

| Status | What the plugin does |
| --- | --- |
| 200 `image/png`, PNG magic bytes, at most 1.5 MB | Attaches the pixels for Copilot |
| 404, or any other body | Keeps the handle and reports that this forum process has no pixels |

A 404 is also what a handle you cannot see returns, and what a restart returns after the pixels were dropped. The plugin only requests handles the list response already included, so a 404 here means those pixels are not held.

## Poll

The forum page polls about every four seconds. This plugin reads on each Copilot tool call and each `@s3rch` turn, and reuses that response for four seconds. There is no push channel.

## Out of scope

File bytes, secret values, and image bytes are not in the JSON ledger. Image bytes live in the forum process until it restarts. This plugin does not write them back, does not post `action: desktop`, and does not open a visor.
