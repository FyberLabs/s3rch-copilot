import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { panelsFromBody, renderDesk, selectPanels, snapshotPath } from "../src/desk";

const ALICE = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const EVE = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";
const DAVE = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";

function desktop(handle: string | null) {
  return {
    channel: `s3rch:forum:${ALICE}`,
    session: "11111111-1111-4111-8111-111111111111",
    snapshot: handle ? { handle, mime: "image/png", seq: 2 } : null,
    thinking: [
      { kind: "type", text: "cargo test --locked" },
      { kind: "prompt", text: "count the sheep" },
      { kind: "shell", text: "ignored" },
      { kind: "type", text: "data:image/png;base64,AAAA" },
    ],
    files: [{ handle: "notes.txt" }],
    secrets: [{ handle: "password", value: "hunter2" }],
    png_base64: "AAAA",
    snapshotUrl: "https://evil.example/pixel.png",
    updated: 1_700_000_000,
  };
}

describe("forum desk panels", () => {
  it("keeps the caller's channel and a shared channel, and drops secret values", () => {
    const panels = panelsFromBody({
      channel: { id: `s3rch:forum:${ALICE}`, owner: ALICE },
      desktop: desktop("abc123def0"),
      messages: [{ body: "not the desk" }],
      shared: [
        {
          channel: { id: `s3rch:forum:${EVE}`, owner: EVE },
          desktop: null,
        },
      ],
    });
    assert.ok(panels);
    assert.equal(panels[0]?.role, "owner");
    assert.equal(panels[0]?.snapshotHandle, "abc123def0");
    assert.deepEqual(
      panels[0]?.thinking.map((row) => row.text),
      ["cargo test --locked", "count the sheep"],
    );
    assert.deepEqual(panels[0]?.files, ["notes.txt"]);
    assert.deepEqual(panels[0]?.secrets, ["password"]);
    assert.equal(JSON.stringify(panels).includes("hunter2"), false);
    assert.equal(JSON.stringify(panels).includes("AAAA"), false);
    assert.equal(JSON.stringify(panels).includes("evil.example"), false);
    assert.equal(panels[1]?.role, "renter");
    assert.equal(panels[1]?.owner, EVE);
    assert.equal(panels[1]?.snapshotHandle, null);
  });

  it("returns nothing for an address the response did not include", () => {
    const panels = panelsFromBody({
      channel: { id: `s3rch:forum:${ALICE}`, owner: ALICE },
      desktop: desktop("abc123def0"),
      shared: [],
    });
    assert.ok(panels);
    assert.deepEqual(selectPanels(panels, DAVE), []);
    assert.deepEqual(selectPanels(panels, "not-an-address"), []);
    assert.equal(selectPanels(panels, ALICE.toLowerCase())[0]?.owner, ALICE);
  });

  it("treats a login with no channel as an empty desk", () => {
    const panels = panelsFromBody({ channel: null, desktop: null, shared: [] });
    assert.ok(panels);
    assert.deepEqual(panels, []);
    assert.equal(renderDesk(panels, []), "Nothing on this login.");
  });

  it("refuses a body that is not a forum read", () => {
    assert.equal(panelsFromBody(null), null);
    assert.equal(panelsFromBody({ denied: true, reason: "not-invited" }), null);
    assert.equal(panelsFromBody({ channel: null }), null);
  });

  it("builds a snapshot path only for a handle the desk kept", () => {
    assert.equal(snapshotPath("abc123def0"), "/api/forum?snapshot=abc123def0");
    assert.equal(snapshotPath("a.b:c"), "/api/forum?snapshot=a.b%3Ac");
    assert.equal(snapshotPath("../etc/passwd"), null);
    assert.equal(snapshotPath("https://evil.example/x"), null);
  });

  it("escapes thinking text so the chat does not load a remote image", () => {
    const panels = panelsFromBody({
      channel: { owner: ALICE },
      desktop: {
        session: "11111111-1111-4111-8111-111111111111",
        snapshot: null,
        thinking: [{ kind: "prompt", text: "see ![x](http://evil.example/p.png)" }],
        files: [],
        secrets: [],
      },
      shared: [],
    });
    assert.ok(panels);
    const text = renderDesk(panels, []);
    assert.equal(text.includes("![x](http://evil.example/p.png)"), false);
    assert.equal(text.includes("hunter2"), false);
    assert.match(text, /prompt:/);
  });
});
