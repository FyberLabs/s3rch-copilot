import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { forumHeaders, parseCredential, parseOrigin, sessionCookieName } from "../src/auth";

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJraW5kIjoiZm9ydW0tYm90In0.signature";

describe("forum credentials", () => {
  it("keeps an https origin and drops a path or userinfo", () => {
    assert.equal(parseOrigin("https://s3r.ch"), "https://s3r.ch");
    assert.equal(parseOrigin(" https://s3r.ch/ "), "https://s3r.ch");
    assert.equal(parseOrigin("https://s3r.ch/forum"), null);
    assert.equal(parseOrigin("https://user:secret@s3r.ch"), null);
    assert.equal(parseOrigin("http://127.0.0.1:3000"), "http://127.0.0.1:3000");
  });

  it("accepts a forum JWT and refuses an API-key shape", () => {
    assert.equal(parseCredential(`  ${JWT}  `), JWT);
    assert.equal(parseCredential("hm_live_secret"), null);
    assert.equal(parseCredential("not a jwt"), null);
    assert.equal(parseCredential(""), null);
  });

  it("sends the forum token on its header and nothing else", () => {
    const headers = forumHeaders("https://s3r.ch", { kind: "forum-token", token: JWT });
    assert.equal(headers["x-s3rch-forum-token"], JWT);
    assert.equal("cookie" in headers, false);
    assert.equal("authorization" in headers, false);
    assert.equal("x-api-key" in headers, false);
  });

  it("sends the SIWE cookie under the host prefix the forum expects", () => {
    assert.equal(sessionCookieName("https://s3r.ch"), "__Host-s3rch-session");
    assert.equal(sessionCookieName("http://127.0.0.1:3000"), "Host-s3rch-session");
    const headers = forumHeaders("https://s3r.ch", { kind: "session-cookie", cookie: JWT });
    assert.equal(headers.cookie, `__Host-s3rch-session=${JWT}`);
    assert.equal("x-s3rch-forum-token" in headers, false);
    assert.equal("authorization" in headers, false);
  });
});
