import { useState } from "react";
import { useAgent } from "@copilotkit/react-core/v2";
import { PaperCard, parsePapers, type Paper } from "@/components/paper-card";

/**
 * Renders the `search_arxiv` results as a SELECTABLE list. Search returns
 * several candidates; instead of letting the agent silently pick one to file,
 * the user ticks the papers they want and clicks "File selected" — which sends
 * the agent a precise instruction to file exactly those (each still confirmed by
 * the approval card). All of this is frontend-only; the agent is unchanged.
 */
export function SearchResults({
  query,
  result,
  status,
}: {
  query?: string;
  result: string | undefined;
  status: "inProgress" | "executing" | "complete";
}) {
  const { agent } = useAgent({ agentId: "default" });
  const papers: Paper[] = status === "complete" ? parsePapers(result) : [];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const fileSelected = () => {
    const chosen = papers.filter((p) => selected.has(p.id));
    if (!chosen.length) return;
    const list = chosen.map((p) => `- ${p.id} — ${p.title}`).join("\n");
    const content =
      `Please file these specific papers into my library. For each one, fetch it by its ` +
      `arXiv id and file it${query ? ` under a topic appropriate for "${query}"` : ""}:\n${list}`;
    agent.addMessage({ id: crypto.randomUUID(), role: "user", content });
    agent.runAgent();
    setSent(true);
  };

  return (
    <div className="my-2 space-y-2">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        {status !== "complete" ? (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
        ) : (
          <span className="text-teal-600">🔎</span>
        )}
        <span>Searching arXiv{query ? <> for “{query}”</> : null}</span>
      </div>

      {papers.length > 0 && (
        <>
          <div className="space-y-2">
            {papers.map((p, i) => {
              const id = p.id || String(i);
              const isSel = selected.has(id);
              return (
                <label
                  key={id}
                  className={`flex cursor-pointer gap-2 rounded-2xl border p-1 transition ${
                    isSel ? "border-teal-400/70 bg-teal-500/10" : "border-transparent"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSel}
                    disabled={sent}
                    onChange={() => toggle(id)}
                    className="mt-4 ml-1 h-4 w-4 shrink-0 accent-teal-600"
                  />
                  <div className="min-w-0 flex-1">
                    <PaperCard paper={p} />
                  </div>
                </label>
              );
            })}
          </div>

          {!sent ? (
            <button
              onClick={fileSelected}
              disabled={selected.size === 0}
              className="rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              File {selected.size || ""} selected paper{selected.size === 1 ? "" : "s"} →
            </button>
          ) : (
            <div className="text-xs text-[#5b7173]">
              📥 Filing {selected.size} paper{selected.size === 1 ? "" : "s"} — approve each below.
            </div>
          )}
        </>
      )}
    </div>
  );
}
