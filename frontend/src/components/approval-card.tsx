import { useState } from "react";
import { getPendingIntent, clearPendingIntent } from "@/lib/pending-intent";

/**
 * Renders the deep agent's file-write gate as an approve / edit / reject card.
 * The agent pauses (via `interrupt_on={"write_file","edit_file"}`) before
 * changing the library; `useInterrupt` delivers that pause as `event.value` (a
 * JSON string of `action_requests`), and `resolve(...)` resumes the graph with
 * `{ decisions: [{ type: "approve" | "reject" | "edit", ... }] }`.
 *
 * The card adapts to the ACTUAL action: adding a paper (write_file), removing one
 * (edit_file that deletes text), or updating one (edit_file) — so "remove this
 * paper" doesn't read as "add a new entry".
 */

interface ActionRequest {
  name?: string;
  action?: string;
  args?: Record<string, unknown>;
}

function extractRequest(value: unknown): ActionRequest {
  let v: unknown = value;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return {};
    }
  }
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (Array.isArray(obj.action_requests) && obj.action_requests.length) {
      return obj.action_requests[0] as ActionRequest;
    }
    if (obj.action || obj.name) return obj as ActionRequest;
  }
  return {};
}

type Kind = "add" | "remove" | "update";

function classify(tool: string, args: Record<string, unknown>): Kind {
  const oldS = String(args.old_string ?? "");
  const newS = String(args.new_string ?? "");
  if (/write/.test(tool)) return "add";
  if (/delete|remove|rm/.test(tool)) return "remove";
  if (/edit/.test(tool)) {
    // An edit that shrinks the file (esp. to empty) is a removal.
    if (oldS && (newS.trim() === "" || newS.length < oldS.length * 0.6)) return "remove";
    return "update";
  }
  return "add";
}

const COPY: Record<Kind, { title: string; verb: string; accent: string; border: string; bg: string }> = {
  add: { title: "Approve before it's filed", verb: "save a new entry", accent: "text-amber-600", border: "border-amber-300", bg: "bg-amber-50" },
  remove: { title: "Approve this removal", verb: "remove an entry", accent: "text-red-600", border: "border-red-300", bg: "bg-red-50" },
  update: { title: "Approve this change", verb: "update an entry", accent: "text-amber-600", border: "border-amber-300", bg: "bg-amber-50" },
};

export function ApprovalCard({
  value,
  resolve,
}: {
  value: unknown;
  resolve: (response: unknown) => void;
}) {
  const req = extractRequest(value);
  const toolName = req.name ?? req.action ?? "write_file";
  const args = req.args ?? {};
  const filePath = (args.file_path ?? args.path) as string | undefined;
  const topicFromPath = filePath?.match(/library\/([^/]+?)(?:\.md)?$/)?.[1];

  // A ✕-click records a "remove" intent; honor it (the agent often removes by
  // rewriting the file with write_file, which the tool call alone reads as "add").
  const intent = getPendingIntent();
  const isRemoveIntent = intent?.kind === "remove" && (!topicFromPath || intent.topic === topicFromPath);
  const kind: Kind = isRemoveIntent ? "remove" : classify(toolName, args);
  const topic = topicFromPath ?? intent?.topic;
  const copy = COPY[kind];

  // What to preview: for an intended removal, name the paper; otherwise the
  // written/edited content.
  const preview = isRemoveIntent
    ? `Removing: ${intent!.title}`
    : kind === "add"
      ? (args.content as string) ?? ""
      : kind === "remove"
        ? (args.old_string as string) ?? (args.content as string) ?? ""
        : (args.new_string as string) ?? "";

  // The editable field depends on the tool: write_file uses `content`,
  // edit_file uses `new_string`. Edit the right one so "Save & file" actually
  // applies to appends too (not just fresh writes).
  const editKey = "content" in args ? "content" : "new_string" in args ? "new_string" : "content";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(args.content ?? args.new_string ?? ""));
  const [done, setDone] = useState<null | "approve" | "edit" | "reject">(null);

  if (done) {
    const label =
      done === "reject"
        ? "🚫 Cancelled — nothing changed."
        : kind === "remove"
          ? "🗑️ Removed from your library."
          : done === "edit"
            ? "✏️ Filed with your edits."
            : "✅ Filed into your library.";
    return <div className="my-2 rounded-2xl border border-white/70 bg-white/55 px-4 py-2.5 text-sm text-[#5b7173] backdrop-blur-md">{label}</div>;
  }

  return (
    <div className={`my-2 overflow-hidden rounded-2xl border backdrop-blur-md ${copy.border} ${copy.bg}`}>
      <div className={`flex items-center gap-2 border-b ${copy.border} px-4 py-2`}>
        <span className={copy.accent}>{kind === "remove" ? "🗑️" : "⏸"}</span>
        <span className="font-display text-sm font-semibold text-[#132a2b]">{copy.title}</span>
      </div>

      <div className="space-y-2.5 p-4">
        <p className="text-xs text-gray-600">
          The agent wants to {copy.verb}
          {topic ? (
            <>
              {" "}
              {kind === "remove" ? "from" : "to"} the <span className="font-semibold text-gray-800">{topic}</span> shelf
            </>
          ) : null}
          {filePath ? <span className="ml-1 font-mono text-[11px] text-gray-500">({filePath})</span> : null}.
        </p>

        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-48 w-full rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs text-gray-800"
          />
        ) : preview ? (
          <pre className={`max-h-48 overflow-auto rounded-lg border ${copy.border} bg-white p-3 text-[11px] leading-relaxed whitespace-pre-wrap ${kind === "remove" ? "text-red-700" : "text-gray-700"}`}>
            {preview}
          </pre>
        ) : (
          <p className="text-[11px] italic text-gray-400">(approve to let the agent run {toolName})</p>
        )}

        <div className="flex flex-wrap gap-2 pt-0.5">
          <button
            onClick={() => {
              resolve({ decisions: [{ type: "approve" }] });
              clearPendingIntent();
              setDone("approve");
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm ${kind === "remove" ? "bg-red-600 hover:bg-red-700" : "bg-teal-600 hover:bg-teal-700"}`}
          >
            {kind === "remove" ? "✓ Remove" : "✓ Approve"}
          </button>
          {kind !== "remove" &&
            (!editing ? (
              <button
                onClick={() => setEditing(true)}
                disabled={!preview}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                ✎ Edit
              </button>
            ) : (
              <button
                onClick={() => {
                  resolve({ decisions: [{ type: "edit", edited_action: { name: toolName, args: { ...args, [editKey]: draft } } }] });
                  clearPendingIntent();
                  setDone("edit");
                }}
                className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-teal-700"
              >
                Save & file
              </button>
            ))}
          <button
            onClick={() => {
              resolve({
                decisions: [
                  {
                    type: "reject",
                    // Sent to the model so it doesn't narrate success after a reject.
                    message:
                      "The user REJECTED this action. Nothing was written and no file changed. " +
                      "Do NOT say you added, filed, saved, updated, or removed anything — just briefly " +
                      "tell the user the action was cancelled.",
                  },
                ],
              });
              clearPendingIntent();
              setDone("reject");
            }}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            ✕ {kind === "remove" ? "Keep it" : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}
