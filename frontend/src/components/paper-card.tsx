export interface Paper {
  id: string;
  title: string;
  authors?: string;
  published?: string;
  abstract?: string;
}

/**
 * Parse the markdown string returned by the `search_arxiv` tool into structured
 * papers. The tool returns blocks like:
 *
 *   ### <title>
 *   - id: 2401.12345
 *   - authors: A, B et al.
 *   - published: 2024-01-20
 *   - abstract: ...
 */
export function parsePapers(result: string | undefined): Paper[] {
  if (!result || typeof result !== "string") return [];
  const blocks = result.split(/^###\s+/m).slice(1);
  return blocks.map((block) => {
    const [titleLine, ...rest] = block.split("\n");
    const field = (name: string) => {
      const line = rest.find((l) => l.trim().toLowerCase().startsWith(`- ${name}:`));
      return line ? line.slice(line.indexOf(":") + 1).trim() : undefined;
    };
    return {
      title: titleLine.trim(),
      id: field("id") ?? "",
      authors: field("authors"),
      published: field("published"),
      abstract: field("abstract"),
    };
  });
}

export function PaperCard({
  paper,
  onRemove,
  removing,
}: {
  paper: Paper;
  onRemove?: () => void;
  removing?: boolean;
}) {
  const arxivUrl = paper.id ? `https://arxiv.org/abs/${paper.id}` : undefined;
  return (
    <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/60 shadow-[0_10px_30px_-18px_rgba(15,60,60,0.45)] backdrop-blur-md">
      <div className="space-y-1.5 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-sm font-semibold leading-snug text-[#132a2b]">{paper.title}</h3>
          <div className="flex shrink-0 items-center gap-1.5">
            {paper.id && (
              <span className="rounded-md bg-teal-600/10 px-1.5 py-0.5 font-mono text-[10px] text-teal-700">
                {paper.id}
              </span>
            )}
            {onRemove && (
              <button
                title="Remove from library"
                disabled={removing}
                onClick={onRemove}
                className="flex h-5 w-5 items-center justify-center rounded-full text-[#8aa0a0] hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
              >
                {removing ? "…" : "✕"}
              </button>
            )}
          </div>
        </div>
        {(paper.authors || paper.published) && (
          <p className="text-xs text-[#6b8382]">
            {paper.authors}
            {paper.authors && paper.published ? " · " : ""}
            {paper.published}
          </p>
        )}
        {paper.abstract && (
          <p className="text-xs leading-relaxed text-[#5b7173] line-clamp-3">{paper.abstract}</p>
        )}
        {arxivUrl && (
          <a
            href={arxivUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-xs font-medium text-teal-700 hover:underline"
          >
            View on arXiv →
          </a>
        )}
      </div>
    </div>
  );
}
