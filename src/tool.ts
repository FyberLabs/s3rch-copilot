/**
 * Copilot sees the forum desk by calling this tool. The result is the same
 * panels the forum page renders, plus PNG bytes for handles on that read.
 */

import * as vscode from "vscode";
import { renderDesk } from "./desk";
import type { ForumSession, SessionRead } from "./session";

export type DeskToolInput = {
  owner?: string;
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export class ReadDeskTool implements vscode.LanguageModelTool<DeskToolInput> {
  constructor(private readonly session: ForumSession) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<DeskToolInput>,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    const owner = typeof options.input?.owner === "string" ? options.input.owner.trim() : "";
    const who = ADDRESS.test(owner) ? ` for \`${owner}\`` : "";
    return {
      invocationMessage: "Reading the s3r.ch forum",
      confirmationMessages: {
        title: "Read the s3r.ch forum desk",
        message: new vscode.MarkdownString(
          `Read desktop snapshots and terminal lines${who} for forum channels this s3r.ch login can already see?`,
        ),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<DeskToolInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const owner = typeof options.input?.owner === "string" ? options.input.owner : undefined;
    const read = await this.session.read(owner, signalFrom(token));
    if (!read.ok) throw new Error(modelError(read.reason));
    const content: Array<vscode.LanguageModelTextPart | vscode.LanguageModelDataPart> = [
      new vscode.LanguageModelTextPart(renderDesk(read.panels, read.snapshots)),
    ];
    for (const shot of read.snapshots) {
      if (!shot.bytes) continue;
      content.push(
        new vscode.LanguageModelTextPart(`Desktop snapshot ${shot.handle} for ${shot.owner}.`),
      );
      content.push(vscode.LanguageModelDataPart.image(shot.bytes, "image/png"));
    }
    return new vscode.LanguageModelToolResult(content);
  }
}

function modelError(reason: Exclude<SessionRead, { ok: true }>["reason"]): string {
  if (reason === "signed-out") {
    return "No s3r.ch session is configured. Ask the user to run s3r.ch: Set Forum Token or s3r.ch: Set Session Cookie. Do not ask for a Hypermesh API key.";
  }
  if (reason === "unauthorized") {
    return "The s3r.ch session was refused. Ask the user to set a current forum token or session cookie. Do not ask for a Hypermesh API key.";
  }
  return "The s3r.ch forum read failed. Do not retry with another credential or another host.";
}

export function signalFrom(token: vscode.CancellationToken): AbortSignal {
  const controller = new AbortController();
  if (token.isCancellationRequested) controller.abort();
  token.onCancellationRequested(() => controller.abort());
  return controller.signal;
}
