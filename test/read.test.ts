import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ForumAuth } from "../src/auth";
import { FORUM_POLL_MS, DeskCache, type ForumFetch } from "../src/read";

const ALICE = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const EVE = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";
const DAVE = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJraW5kIjoiZm9ydW0tYm90In0.signature";
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const ORIGIN = "https://s3r.ch";

const auth: ForumAuth = { kind: "forum-token", token: TOKEN };

function forumBody() {
  return JSON.stringify({
    channel: { id: `s3rch:forum:${ALICE}`, owner: ALICE },
    desktop: {
      channel: `s3rch:forum:${ALICE}`,
      session: "11111111-1111-4111-8111-111111111111",
      snapshot: { handle: "abc123def0", mime: "image/png", seq: 2 },
      thinking: [{ kind: "type", text: "cargo test --locked" }],
      files: [{ handle: "notes.txt" }],
      secrets: [{ handle: "password", value: "hunter2" }],
      updated: 1_700_000_000,
    },
    shared: [
      {
        channel: { id: `s3rch:forum:${EVE}`, owner: EVE },
        desktop: {
          channel: `s3rch:forum:${EVE}`,
          session: "22222222-2222-4222-8222-222222222222",
          snapshot: { handle: "eve0000001", mime: "image/png", seq: 1 },
          thinking: [{ kind: "focus", text: "terminal" }],
          files: [],
          secrets: [],
          updated: 1_700_000_001,
        },
      },
    ],
  });
}

function harness(routes: Record<string, { status: number; body?: string; bytes?: Uint8Array; type?: string }>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: ForumFetch = async (url, init) => {
    calls.push({ url, init });
    const route = routes[url];
    if (!route) return new Response("missing", { status: 599 });
    const headers = new Headers();
    if (route.bytes) headers.set("content-type", route.type ?? "image/png");
    else headers.set("content-type", route.type ?? "application/json");
    const payload = route.bytes ?? route.body ?? "";
    return new Response(payload, { status: route.status, headers });
  };
  return { fetchImpl, calls };
}

function headerMap(init: RequestInit): Record<string, string> {
  const headers = new Headers(init.headers);
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

describe("forum read", () => {
  it("loads pixels only for handles on the forum response", async () => {
    const { fetchImpl, calls } = harness({
      [`${ORIGIN}/api/forum`]: { status: 200, body: forumBody() },
      [`${ORIGIN}/api/forum?snapshot=abc123def0`]: { status: 200, bytes: PNG },
      [`${ORIGIN}/api/forum?snapshot=eve0000001`]: { status: 404, body: "" },
    });
    const cache = new DeskCache(fetchImpl, () => 1_000);
    const read = await cache.read({ origin: ORIGIN, auth });
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.equal(read.panels.length, 2);
    assert.equal(read.snapshots[0]?.bytes?.byteLength, PNG.byteLength);
    assert.equal(read.snapshots[1]?.bytes, null);
    assert.deepEqual(
      calls.map((call) => call.url),
      [
        `${ORIGIN}/api/forum`,
        `${ORIGIN}/api/forum?snapshot=abc123def0`,
        `${ORIGIN}/api/forum?snapshot=eve0000001`,
      ],
    );
    const headers = headerMap(calls[0]!.init);
    assert.equal(headers["x-s3rch-forum-token"], TOKEN);
    assert.equal(headers.authorization, undefined);
    assert.equal(headers["x-api-key"], undefined);
    assert.equal(calls[0]?.init.redirect, "manual");
    assert.equal(calls[0]?.init.credentials, "omit");
    assert.equal(JSON.stringify(read.panels).includes("hunter2"), false);
  });

  it("does not fetch a snapshot when the address is absent", async () => {
    const { fetchImpl, calls } = harness({
      [`${ORIGIN}/api/forum`]: { status: 200, body: forumBody() },
      [`${ORIGIN}/api/forum?snapshot=abc123def0`]: { status: 200, bytes: PNG },
    });
    const cache = new DeskCache(fetchImpl, () => 1_000);
    const read = await cache.read({ origin: ORIGIN, auth, owner: DAVE });
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.deepEqual(read.panels, []);
    assert.deepEqual(read.snapshots, []);
    assert.deepEqual(
      calls.map((call) => call.url),
      [`${ORIGIN}/api/forum`],
    );
  });

  it("stops on 401 before any snapshot request", async () => {
    const { fetchImpl, calls } = harness({
      [`${ORIGIN}/api/forum`]: { status: 401, body: JSON.stringify({ error: "unauthorized" }) },
      [`${ORIGIN}/api/forum?snapshot=abc123def0`]: { status: 200, bytes: PNG },
    });
    const cache = new DeskCache(fetchImpl, () => 1_000);
    const read = await cache.read({ origin: ORIGIN, auth });
    assert.deepEqual(read, { ok: false, reason: "unauthorized" });
    assert.deepEqual(
      calls.map((call) => call.url),
      [`${ORIGIN}/api/forum`],
    );
  });

  it("does not follow a redirect", async () => {
    const { fetchImpl, calls } = harness({
      [`${ORIGIN}/api/forum`]: { status: 302, body: "", type: "text/html" },
      "https://evil.example/api/forum": { status: 200, body: forumBody() },
    });
    const cache = new DeskCache(fetchImpl, () => 1_000);
    const read = await cache.read({ origin: ORIGIN, auth });
    assert.deepEqual(read, { ok: false, reason: "forum-error" });
    assert.deepEqual(
      calls.map((call) => call.url),
      [`${ORIGIN}/api/forum`],
    );
  });

  it("rejects a PNG that is not a PNG", async () => {
    const { fetchImpl } = harness({
      [`${ORIGIN}/api/forum`]: { status: 200, body: forumBody() },
      [`${ORIGIN}/api/forum?snapshot=abc123def0`]: {
        status: 200,
        bytes: Uint8Array.from([1, 2, 3, 4]),
      },
      [`${ORIGIN}/api/forum?snapshot=eve0000001`]: { status: 200, bytes: PNG, type: "text/html" },
    });
    const cache = new DeskCache(fetchImpl, () => 1_000);
    const read = await cache.read({ origin: ORIGIN, auth });
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.equal(read.snapshots[0]?.bytes, null);
    assert.equal(read.snapshots[1]?.bytes, null);
  });

  it("reuses a read inside the forum poll interval", async () => {
    let now = 10_000;
    const { fetchImpl, calls } = harness({
      [`${ORIGIN}/api/forum`]: { status: 200, body: forumBody() },
      [`${ORIGIN}/api/forum?snapshot=abc123def0`]: { status: 200, bytes: PNG },
      [`${ORIGIN}/api/forum?snapshot=eve0000001`]: { status: 200, bytes: PNG },
    });
    const cache = new DeskCache(fetchImpl, () => now);
    await cache.read({ origin: ORIGIN, auth });
    await cache.read({ origin: ORIGIN, auth });
    assert.equal(calls.length, 3);
    now += FORUM_POLL_MS;
    await cache.read({ origin: ORIGIN, auth });
    assert.equal(calls.length, 6);
  });

  it("sends the session cookie and not the forum token header", async () => {
    const { fetchImpl, calls } = harness({
      [`${ORIGIN}/api/forum`]: {
        status: 200,
        body: JSON.stringify({ channel: null, desktop: null, shared: [] }),
      },
    });
    const cache = new DeskCache(fetchImpl, () => 1_000);
    const read = await cache.read({
      origin: ORIGIN,
      auth: { kind: "session-cookie", cookie: TOKEN },
    });
    assert.equal(read.ok, true);
    const headers = headerMap(calls[0]!.init);
    assert.equal(headers.cookie, `__Host-s3rch-session=${TOKEN}`);
    assert.equal(headers["x-s3rch-forum-token"], undefined);
  });
});
