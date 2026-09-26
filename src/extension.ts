/**
 * s3r.ch desk for VS Code Copilot.
 *
 * Copilot calls `s3rch_read_desk`. `@s3rch` renders that same read.
 * Both use the renter's forum token or SIWE cookie against GET /api/forum.
 */

import * as vscode from "vscode";
import { registerParticipant } from "./participant";
import { ForumSession } from "./session";
import { ReadDeskTool } from "./tool";

export function activate(context: vscode.ExtensionContext): void {
  const session = new ForumSession(context.secrets);

  context.subscriptions.push(
    vscode.lm.registerTool("s3rch_read_desk", new ReadDeskTool(session)),
    vscode.commands.registerCommand("s3rch.setForumToken", () => setToken(session)),
    vscode.commands.registerCommand("s3rch.setSessionCookie", () => setCookie(session)),
    vscode.commands.registerCommand("s3rch.clearCredentials", () => clear(session)),
    vscode.commands.registerCommand("s3rch.openSnapshot", (handle?: unknown) => openSnapshot(context, session, handle)),
  );
  registerParticipant(context, session);
}

export function deactivate(): void {}

async function setToken(session: ForumSession): Promise<void> {
  const value = await vscode.window.showInputBox({
    title: "s3r.ch forum token",
    prompt: "Owner token from POST /api/forum with action token. Sent as x-s3rch-forum-token.",
    password: true,
    ignoreFocusOut: true,
  });
  if (value === undefined) return;
  if (!(await session.setForumToken(value))) {
    void vscode.window.showErrorMessage("That value is not an s3r.ch forum token.");
    return;
  }
  void vscode.window.showInformationMessage("s3r.ch forum token stored.");
}

async function setCookie(session: ForumSession): Promise<void> {
  const value = await vscode.window.showInputBox({
    title: "s3r.ch session cookie",
    prompt: "Value of the __Host-s3rch-session cookie from a signed-in s3r.ch browser.",
    password: true,
    ignoreFocusOut: true,
  });
  if (value === undefined) return;
  if (!(await session.setSessionCookie(value))) {
    void vscode.window.showErrorMessage("That value is not an s3r.ch session cookie.");
    return;
  }
  void vscode.window.showInformationMessage("s3r.ch session cookie stored.");
}

async function clear(session: ForumSession): Promise<void> {
  await session.clear();
  void vscode.window.showInformationMessage("s3r.ch credentials cleared.");
}

async function openSnapshot(
  context: vscode.ExtensionContext,
  session: ForumSession,
  handle: unknown,
): Promise<void> {
  const images = session.images();
  if (images.length === 0) {
    void vscode.window.showInformationMessage("No snapshot from the last forum read.");
    return;
  }
  let picked = typeof handle === "string" ? images.find((row) => row.handle === handle) : undefined;
  if (!picked && typeof handle !== "string") {
    const choice = await vscode.window.showQuickPick(
      images.map((row) => row.handle),
      { title: "s3r.ch snapshot", placeHolder: "Snapshot from the last forum read" },
    );
    if (!choice) return;
    picked = images.find((row) => row.handle === choice);
  }
  if (!picked) return;
  const folder = context.globalStorageUri;
  await vscode.workspace.fs.createDirectory(folder);
  const uri = vscode.Uri.joinPath(folder, `${picked.handle}.png`);
  await vscode.workspace.fs.writeFile(uri, picked.bytes);
  await vscode.commands.executeCommand("vscode.open", uri);
}
