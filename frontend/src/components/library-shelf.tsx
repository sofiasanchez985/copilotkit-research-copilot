import { useEffect, useState } from "react";
import { useAgent } from "@copilotkit/react-core/v2";
import { PaperCard, type Paper } from "@/components/paper-card";
import { MarkdownLite } from "@/components/markdown-lite";
import { setRemoveIntent } from "@/lib/pending-intent";

/**
 * The live research library — the agent's memory made visible.
 *
 * The deep agent files approved papers to /memories/library/<topic>.md, which
 * lives in the agent's store (not its graph state), so we can't read it through
 * CopilotKit shared state. Instead the backend exposes it at GET /library and we
 * read that here. We still subscribe to the agent via `useAgent` and refetch
 * whenever its state changes, so shelves fill in moments after a paper is filed.
 *
 * Click a topic folder to drill in and see each paper as a card; the ✕ on a card
 * asks the agent to remove that paper (gated by the approval card, like filing).
 */

interface Shelf {
  topic: string;
  count: number;
  papers: Paper[];
  raw: string;
}

export function LibraryShelf() {
  const { agent } = useAgent({ agentId: "default" });
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Set<string>>(new Set());

  async function refresh() {
    try {
      const res = await fetch("/agui/library");
      if (!res.ok) return;
      const data = await res.json();
      setShelves(data.shelves ?? []);
    } catch {
      /* backend not ready yet — ignore */
    }
  }

  useEffect(() => {
    refresh();
  }, [agent?.state]);

  useEffect(() => {
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, []);

  const removePaper = (topic: string, paper: Paper) => {
    setRemoving((prev) => new Set(prev).add(paper.id));
    // Tell the approval card this upcoming file change is a removal.
    setRemoveIntent({ kind: "remove", topic, id: paper.id, title: paper.title });
    agent.addMessage({
      id: crypto.randomUUID(),
      role: "user",
      content:
        `Remove the paper "${paper.title}" (arXiv ${paper.id}) from the ${topic} shelf. ` +
        `Edit /memories/library/${topic}.md to delete that entry.`,
    });
    agent.runAgent();
  };

  // Hide topics that have been emptied (e.g. after removing their last paper).
  const visibleShelves = shelves.filter((s) => s.count > 0);
  const open = openTopic ? shelves.find((s) => s.topic === openTopic) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 py-4">
        <h1 className="font-display text-lg font-semibold text-[#132a2b]">📚 Research Library</h1>
        <p className="mt-0.5 text-xs text-[#5b7173]">
          Papers the agent has filed, by topic. Click a folder to see what's inside.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {open ? (
          /* Drill-in view: each paper as a card, with ✕ to remove */
          <div className="space-y-3">
            <button
              onClick={() => setOpenTopic(null)}
              className="flex items-center gap-1 text-sm font-medium text-teal-700 hover:underline"
            >
              ← All topics
            </button>
            <div className="flex items-baseline gap-2">
              <h2 className="font-display text-base font-semibold text-[#132a2b]">🗂️ {open.topic}</h2>
              <span className="text-xs text-[#5b7173]">
                {open.count} paper{open.count === 1 ? "" : "s"}
              </span>
            </div>

            {open.papers.length > 0 ? (
              <div className="space-y-2">
                {open.papers.map((p) => (
                  <PaperCard
                    key={p.id}
                    paper={p}
                    removing={removing.has(p.id)}
                    onRemove={() => removePaper(open.topic, p)}
                  />
                ))}
              </div>
            ) : (
              /* Parsing found no papers — show the raw file so nothing's hidden */
              <div className="rounded-2xl border border-white/70 bg-white/60 p-4 shadow-sm backdrop-blur-md">
                {open.raw.trim() ? (
                  <MarkdownLite content={open.raw} />
                ) : (
                  <p className="text-sm text-[#8aa0a0]">This topic file is empty.</p>
                )}
              </div>
            )}
          </div>
        ) : visibleShelves.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-[#8aa0a0]">
            <div className="text-4xl">🗄️</div>
            <p className="mt-2 max-w-xs text-sm">
              Your library is empty. Try asking the chat:{" "}
              <span className="font-medium text-[#5b7173]">“Find papers on epigenetic aging clocks.”</span>
            </p>
          </div>
        ) : (
          /* Grid of topic folders */
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {visibleShelves.map((shelf) => (
              <button
                key={shelf.topic}
                onClick={() => setOpenTopic(shelf.topic)}
                title={shelf.topic}
                className="flex w-full min-w-0 flex-col rounded-2xl border border-white/70 bg-white/60 p-4 text-left shadow-[0_10px_30px_-18px_rgba(15,60,60,0.45)] backdrop-blur-md transition hover:-translate-y-0.5 hover:border-teal-300/70 hover:shadow-[0_16px_36px_-20px_rgba(13,148,136,0.5)]"
              >
                <div className="text-2xl">🗂️</div>
                <div className="mt-1 w-full truncate font-display text-sm font-semibold text-[#132a2b]">{shelf.topic}</div>
                <div className="text-xs text-[#5b7173]">
                  {shelf.count} paper{shelf.count === 1 ? "" : "s"}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
