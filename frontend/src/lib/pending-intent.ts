/**
 * A tiny shared signal so a UI action can tell the approval card what it's for.
 *
 * The agent decides HOW to change a file — e.g. it often removes a paper by
 * rewriting the file with `write_file`, not `edit_file` — so the approval card
 * can't tell "remove" from "add" by the tool call alone. When the user clicks ✕
 * on a paper we record a "remove" intent here; the approval card reads it so the
 * dialogue matches the action the user actually took. It's cleared once resolved.
 */

export interface RemoveIntent {
  kind: "remove";
  topic: string;
  id: string;
  title: string;
}

let pending: RemoveIntent | null = null;

export function setRemoveIntent(intent: RemoveIntent): void {
  pending = intent;
}

export function getPendingIntent(): RemoveIntent | null {
  return pending;
}

export function clearPendingIntent(): void {
  pending = null;
}
