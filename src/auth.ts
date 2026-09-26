/**
 * Credentials the s3r.ch forum already issues.
 *
 * A forum token is sent as `x-s3rch-forum-token`. A SIWE session is the
 * `__Host-s3rch-session` cookie (or `Host-s3rch-session` on plain HTTP).
 * Neither is a Hypermesh API key. This module never sets `Authorization`
 * or an API-key header.
 */

import { createHash } from "node:crypto";

const CREDENTIAL_MAX = 4096;
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export type ForumAuth =
  | { kind: "forum-token"; token: string }
  | { kind: "session-cookie"; cookie: string };

export function parseOrigin(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  return url.origin;
}

/** Accept a SIWE session JWT or an owner forum JWT. Refuse anything else. */
export function parseCredential(value: string): string | null {
  const token = value.trim();
  if (!token || token.length > CREDENTIAL_MAX) return null;
  if (token.startsWith("hm_")) return null;
  if (!JWT.test(token)) return null;
  return token;
}

export function sessionCookieName(origin: string): "__Host-s3rch-session" | "Host-s3rch-session" {
  return origin.startsWith("https:") ? "__Host-s3rch-session" : "Host-s3rch-session";
}

export function forumHeaders(origin: string, auth: ForumAuth): Record<string, string> {
  const accept = "application/json, image/png";
  if (auth.kind === "forum-token") {
    return { accept, "x-s3rch-forum-token": auth.token };
  }
  return { accept, cookie: `${sessionCookieName(origin)}=${auth.cookie}` };
}

export function authKey(auth: ForumAuth): string {
  const raw = auth.kind === "forum-token" ? `token\n${auth.token}` : `cookie\n${auth.cookie}`;
  return createHash("sha256").update(raw).digest("hex");
}
