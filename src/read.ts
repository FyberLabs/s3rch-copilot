/**
 * One forum read: GET /api/forum, then snapshot bytes for handles that
 * response already listed. A 401 stops before any snapshot request.
 * A handle the body did not list is never requested.
 */

import { authKey, forumHeaders, parseOrigin, type ForumAuth } from "./auth";
import { panelsFromBody, selectPanels, snapshotPath, type DeskPanel, type DeskSnapshot } from "./desk";

export const FORUM_POLL_MS = 4000;
const JSON_CAP = 2_000_000;
const PNG_CAP = 1_500_000;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type ForumFetch = (url: string, init: RequestInit) => Promise<Response>;

export type DeskRead =
  | { ok: true; panels: DeskPanel[]; snapshots: DeskSnapshot[] }
  | { ok: false; reason: "unauthorized" | "forum-error" };

export type ReadInput = {
  origin: string;
  auth: ForumAuth;
  owner?: string;
  signal?: AbortSignal;
};

export class DeskCache {
  private body: { key: string; at: number; panels: DeskPanel[] } | null = null;
  private png = new Map<string, { at: number; bytes: Uint8Array | null }>();
  private shown: { handle: string; bytes: Uint8Array }[] = [];

  constructor(
    private readonly fetchImpl: ForumFetch,
    private readonly now: () => number = Date.now,
  ) {}

  async read(input: ReadInput): Promise<DeskRead> {
    const origin = parseOrigin(input.origin);
    if (!origin) return { ok: false, reason: "forum-error" };
    const key = `${origin}\n${authKey(input.auth)}`;
    const now = this.now();
    if (!this.body || this.body.key !== key || now - this.body.at >= FORUM_POLL_MS) {
      const loaded = await loadPanels(this.fetchImpl, origin, input.auth, input.signal);
      if (!loaded.ok) return loaded;
      this.body = { key, at: now, panels: loaded.panels };
      this.png.clear();
    }
    const panels = selectPanels(this.body.panels, input.owner);
    const snapshots: DeskSnapshot[] = [];
    const seen = new Set<string>();
    for (const panel of panels) {
      if (!panel.snapshotHandle || seen.has(`${panel.owner}\n${panel.snapshotHandle}`)) continue;
      seen.add(`${panel.owner}\n${panel.snapshotHandle}`);
      const shotKey = `${key}\n${panel.snapshotHandle}`;
      let held = this.png.get(shotKey);
      if (!held || now - held.at >= FORUM_POLL_MS) {
        const bytes = await loadSnapshot(
          this.fetchImpl,
          origin,
          input.auth,
          panel.snapshotHandle,
          input.signal,
        );
        held = { at: now, bytes };
        this.png.set(shotKey, held);
      }
      snapshots.push({ handle: panel.snapshotHandle, owner: panel.owner, bytes: held.bytes });
    }
    this.shown = snapshots.flatMap((row) => (row.bytes ? [{ handle: row.handle, bytes: row.bytes }] : []));
    return { ok: true, panels, snapshots };
  }

  /** PNGs from the last read this cache returned. Not a fresh forum call. */
  images(): { handle: string; bytes: Uint8Array }[] {
    return this.shown.map((row) => ({ handle: row.handle, bytes: row.bytes }));
  }
}

async function loadPanels(
  fetchImpl: ForumFetch,
  origin: string,
  auth: ForumAuth,
  signal: AbortSignal | undefined,
): Promise<{ ok: true; panels: DeskPanel[] } | { ok: false; reason: "unauthorized" | "forum-error" }> {
  let response: Response;
  try {
    response = await fetchImpl(`${origin}/api/forum`, requestInit(origin, auth, signal));
  } catch {
    return { ok: false, reason: "forum-error" };
  }
  if (refused(response)) return { ok: false, reason: "forum-error" };
  if (response.status === 401) return { ok: false, reason: "unauthorized" };
  if (response.status !== 200 || !isJson(response)) return { ok: false, reason: "forum-error" };
  const bytes = await readCapped(response, JSON_CAP);
  if (!bytes) return { ok: false, reason: "forum-error" };
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { ok: false, reason: "forum-error" };
  }
  const panels = panelsFromBody(body);
  if (!panels) return { ok: false, reason: "forum-error" };
  return { ok: true, panels };
}

async function loadSnapshot(
  fetchImpl: ForumFetch,
  origin: string,
  auth: ForumAuth,
  handle: string,
  signal: AbortSignal | undefined,
): Promise<Uint8Array | null> {
  const path = snapshotPath(handle);
  if (!path) return null;
  let response: Response;
  try {
    response = await fetchImpl(`${origin}${path}`, requestInit(origin, auth, signal));
  } catch {
    return null;
  }
  if (refused(response) || response.status !== 200) return null;
  const type = response.headers.get("content-type") ?? "";
  if (!type.startsWith("image/png")) return null;
  const bytes = await readCapped(response, PNG_CAP);
  if (!bytes || !isPng(bytes)) return null;
  return bytes;
}

function requestInit(origin: string, auth: ForumAuth, signal: AbortSignal | undefined): RequestInit {
  return {
    method: "GET",
    headers: forumHeaders(origin, auth),
    redirect: "manual",
    credentials: "omit",
    signal,
  };
}

function refused(response: Response): boolean {
  return response.redirected || (response.status >= 300 && response.status < 400);
}

function isJson(response: Response): boolean {
  const type = response.headers.get("content-type") ?? "";
  return type.startsWith("application/json");
}

async function readCapped(response: Response, max: number): Promise<Uint8Array | null> {
  const declared = response.headers.get("content-length");
  if (declared && Number(declared) > max) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > max) return null;
  return bytes;
}

function isPng(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PNG_MAGIC.length) return false;
  return PNG_MAGIC.every((byte, index) => bytes[index] === byte);
}
