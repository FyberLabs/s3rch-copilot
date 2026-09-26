/**
 * The renter view already on GET /api/forum.
 *
 * Panels come from `channel` and `shared` on that response. Snapshot pixels
 * are not in the JSON. A handle is loaded later from
 * GET /api/forum?snapshot=<handle>, and only when this parse kept it.
 */

export const THINKING_KINDS = ["type", "mouse", "mcp", "focus", "prompt", "file", "secret"] as const;

const HANDLE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SESSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PANEL_CAP = 32;
const THINKING_CAP = 64;

export type DeskThinking = {
  kind: (typeof THINKING_KINDS)[number];
  text: string;
};

export type DeskPanel = {
  owner: string;
  role: "owner" | "renter";
  session: string | null;
  snapshotHandle: string | null;
  thinking: DeskThinking[];
  files: string[];
  secrets: string[];
};

export type DeskSnapshot = {
  handle: string;
  owner: string;
  bytes: Uint8Array | null;
};

const EMPTY_DESK = {
  session: null,
  snapshotHandle: null,
  thinking: [] as DeskThinking[],
  files: [] as string[],
  secrets: [] as string[],
};

export function panelsFromBody(body: unknown): DeskPanel[] | null {
  if (!isRecord(body) || body.denied === true) return null;
  if (!("channel" in body) || !("shared" in body) || !Array.isArray(body.shared)) return null;
  if (body.shared.length > PANEL_CAP) return null;

  const panels: DeskPanel[] = [];
  if (body.channel !== null) {
    const own = panelFrom(body.channel, "owner", body.desktop);
    if (!own) return null;
    panels.push(own);
  }
  for (const row of body.shared) {
    if (!isRecord(row)) return null;
    const shared = panelFrom(row.channel, "renter", row.desktop);
    if (!shared) return null;
    panels.push(shared);
  }
  return panels;
}

export function selectPanels(panels: DeskPanel[], owner?: string): DeskPanel[] {
  if (owner === undefined || owner.trim() === "") return panels;
  if (!ADDRESS.test(owner.trim())) return [];
  const wanted = owner.trim().toLowerCase();
  return panels.filter((panel) => panel.owner.toLowerCase() === wanted);
}

export function snapshotPath(handle: string): string | null {
  if (!HANDLE.test(handle)) return null;
  return `/api/forum?snapshot=${encodeURIComponent(handle)}`;
}

export function renderDesk(panels: DeskPanel[], snapshots: DeskSnapshot[]): string {
  if (panels.length === 0) return "Nothing on this login.";
  const blocks = panels.map((panel) => renderPanel(panel, snapshots));
  return [
    "s3r.ch forum desk. Channels this login can already see. File bytes and secret values are not in this view.",
    ...blocks,
  ].join("\n\n");
}

function renderPanel(panel: DeskPanel, snapshots: DeskSnapshot[]): string {
  const title = panel.role === "owner" ? "Your channel" : "Shared channel";
  const shot = snapshots.find(
    (row) => row.handle === panel.snapshotHandle && row.owner === panel.owner,
  );
  let snapshot: string;
  if (!panel.snapshotHandle) snapshot = "none";
  else if (shot?.bytes) snapshot = escapeMarkdown(panel.snapshotHandle);
  else snapshot = `${escapeMarkdown(panel.snapshotHandle)} (no pixels in this forum process)`;

  const lines = [
    `## ${title}`,
    `owner: \`${panel.owner}\``,
    `session: ${panel.session ? `\`${panel.session}\`` : "none"}`,
    `snapshot: ${snapshot}`,
  ];
  if (panel.thinking.length === 0) {
    lines.push("thinking: none");
  } else {
    lines.push("thinking:");
    for (const row of panel.thinking) {
      lines.push(`- ${row.kind}: ${escapeMarkdown(row.text)}`);
    }
  }
  lines.push(panel.files.length ? `files: ${panel.files.map(escapeMarkdown).join(" ")}` : "files: none");
  lines.push(
    panel.secrets.length ? `secrets: ${panel.secrets.map(escapeMarkdown).join(" ")}` : "secrets: none",
  );
  return lines.join("\n");
}

export function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, (ch) => `\\${ch}`);
}

function panelFrom(
  channel: unknown,
  role: DeskPanel["role"],
  desktop: unknown,
): DeskPanel | null {
  if (!isRecord(channel) || typeof channel.owner !== "string" || !ADDRESS.test(channel.owner)) {
    return null;
  }
  const desk = asDesktop(desktop);
  if (!desk) return null;
  return { owner: channel.owner, role, ...desk };
}

function asDesktop(value: unknown): Omit<DeskPanel, "owner" | "role"> | null {
  if (value === null || value === undefined) return { ...EMPTY_DESK };
  if (!isRecord(value)) return null;
  const session = typeof value.session === "string" && SESSION.test(value.session.trim())
    ? value.session.trim().toLowerCase()
    : null;
  let snapshotHandle: string | null = null;
  if (value.snapshot !== null && value.snapshot !== undefined) {
    if (!isRecord(value.snapshot)) return null;
    if (value.snapshot.mime !== "image/png") return null;
    if (typeof value.snapshot.handle !== "string" || !HANDLE.test(value.snapshot.handle)) return null;
    snapshotHandle = value.snapshot.handle;
  }
  return {
    session,
    snapshotHandle,
    thinking: thinkingLines(value.thinking),
    files: handlesOf(value.files),
    secrets: handlesOf(value.secrets),
  };
}

function thinkingLines(value: unknown): DeskThinking[] {
  if (!Array.isArray(value)) return [];
  const lines: DeskThinking[] = [];
  for (const row of value) {
    if (lines.length >= THINKING_CAP) break;
    if (!isRecord(row) || typeof row.kind !== "string" || typeof row.text !== "string") continue;
    if (!(THINKING_KINDS as readonly string[]).includes(row.kind)) continue;
    if ("value" in row || "bytes" in row || "content_base64" in row || "png_base64" in row) continue;
    const text = row.text.replace(/[\u0000-\u001f]/g, " ").trim();
    if (!text || text.length > 280) continue;
    if (text.includes("content_base64") || text.includes("data:image") || text.includes("png_base64")) {
      continue;
    }
    lines.push({ kind: row.kind as DeskThinking["kind"], text });
  }
  return lines;
}

function handlesOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const handles: string[] = [];
  for (const row of value) {
    if (!isRecord(row) || typeof row.handle !== "string" || !HANDLE.test(row.handle)) continue;
    handles.push(row.handle);
  }
  return handles;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
