/**
 * `@s3rch` renders the same forum read in chat. A question after that is
 * answered by the Copilot model the user already selected.
 */

import * as vscode from "vscode";
import { renderDesk } from "./desk";
import type { DeskRead } from "./read";
import type { ForumSession } from "./session";
import { signalFrom } from "./tool";

export function registerParticipant(context: vscode.ExtensionContext, session: ForumSession): void {
  const participant = vscode.chat.createChatParticipant("s3rch.desk", (request, _chat, stream, token) =>
    handle(session, request, stream, token),
  );
  participant.iconPath = new vscode.ThemeIcon("vm");
  context.subscriptions.push(participant);
}

async function handle(
  session: ForumSession,
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  stream.progress("Reading the s3r.ch forum");
  const read = await session.read(undefined, signalFrom(token));
  if (!read.ok) {
    stream.markdown(failureText(read.reason));
    return;
  }
  stream.markdown(renderDesk(read.panels, read.snapshots));
  for (const shot of read.snapshots) {
    if (!shot.bytes) continue;
    stream.button({
      command: "s3rch.openSnapshot",
      title: `Open snapshot ${shot.handle}`,
      arguments: [shot.handle],
    });
  }
  const prompt = request.prompt.trim();
  if (!prompt) return;
  await answer(request, stream, token, read);
}

async function answer(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  read: Extract<DeskRead, { ok: true }>,
): Promise<void> {
  const parts: Array<vscode.LanguageModelTextPart | vscode.LanguageModelDataPart> = [
    new vscode.LanguageModelTextPart(
      [
        "Answer the user using only this s3r.ch forum desk.",
        "If a channel is absent, this login cannot see it.",
        "Do not invent snapshot pixels, file bytes, or secret values.",
        "Do not ask for a Hypermesh API key.",
        "",
        renderDesk(read.panels, read.snapshots),
        "",
        `User: ${request.prompt}`,
      ].join("\n"),
    ),
  ];
  for (const shot of read.snapshots) {
    if (shot.bytes) parts.push(vscode.LanguageModelDataPart.image(shot.bytes, "image/png"));
  }
  try {
    const response = await request.model.sendRequest(
      [vscode.LanguageModelChatMessage.User(parts)],
      {},
      token,
    );
    stream.markdown("\n\n");
    for await (const chunk of response.text) {
      stream.markdown(chunk);
    }
  } catch {
    stream.markdown("\n\nCopilot could not answer from this desk. The forum read above is the renter view.");
  }
}

function failureText(reason: "signed-out" | "unauthorized" | "forum-error"): string {
  if (reason === "signed-out") {
    return "Sign in with the s3r.ch session cookie or the owner forum token. Run **s3r.ch: Set Forum Token** or **s3r.ch: Set Session Cookie**.";
  }
  if (reason === "unauthorized") {
    return "The s3r.ch session was refused. Set a current forum token or session cookie.";
  }
  return "The s3r.ch forum read failed.";
}
