/**
 * The renter's stored s3r.ch session, and the last desk read Copilot asked for.
 * The forum token wins when both credentials are stored. Setting one clears
 * the other, so a stale cookie cannot override a token.
 */

import * as vscode from "vscode";
import { parseCredential, parseOrigin, type ForumAuth } from "./auth";
import { DeskCache, type DeskRead, type ForumFetch } from "./read";

const TOKEN_KEY = "s3rch.forumToken";
const COOKIE_KEY = "s3rch.sessionCookie";
export const DEFAULT_ORIGIN = "https://s3r.ch";

export type SessionRead = DeskRead | { ok: false; reason: "signed-out" };

export class ForumSession {
  private readonly cache: DeskCache;

  constructor(
    private readonly secrets: vscode.SecretStorage,
    fetchImpl: ForumFetch = globalThis.fetch.bind(globalThis),
  ) {
    this.cache = new DeskCache(fetchImpl);
  }

  origin(): string | null {
    const configured = vscode.workspace.getConfiguration("s3rch").get("forumOrigin", DEFAULT_ORIGIN);
    return parseOrigin(typeof configured === "string" ? configured : "");
  }

  async read(owner: string | undefined, signal?: AbortSignal): Promise<SessionRead> {
    const origin = this.origin();
    if (!origin) return { ok: false, reason: "forum-error" };
    const auth = await this.auth();
    if (!auth) return { ok: false, reason: "signed-out" };
    return this.cache.read({ origin, auth, owner, signal });
  }

  images(): { handle: string; bytes: Uint8Array }[] {
    return this.cache.images();
  }

  async setForumToken(token: string): Promise<boolean> {
    const parsed = parseCredential(token);
    if (!parsed) return false;
    await this.secrets.store(TOKEN_KEY, parsed);
    await this.secrets.delete(COOKIE_KEY);
    return true;
  }

  async setSessionCookie(cookie: string): Promise<boolean> {
    const parsed = parseCredential(cookie);
    if (!parsed) return false;
    await this.secrets.store(COOKIE_KEY, parsed);
    await this.secrets.delete(TOKEN_KEY);
    return true;
  }

  async clear(): Promise<void> {
    await this.secrets.delete(TOKEN_KEY);
    await this.secrets.delete(COOKIE_KEY);
  }

  private async auth(): Promise<ForumAuth | null> {
    const token = await this.secrets.get(TOKEN_KEY);
    if (token && parseCredential(token)) return { kind: "forum-token", token };
    const cookie = await this.secrets.get(COOKIE_KEY);
    if (cookie && parseCredential(cookie)) return { kind: "session-cookie", cookie };
    return null;
  }
}
