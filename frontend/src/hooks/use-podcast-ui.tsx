import { z } from "zod";
import { useInterrupt, useRenderTool } from "@copilotkit/react-core/v2";
import { SearchResults } from "@/components/search-results";
import { ApprovalCard } from "@/components/approval-card";

/**
 * Registers the two generative-UI pieces that give the deep agent a face:
 *
 *  1. useRenderTool("search_arxiv") — the agent's arXiv searches render as a
 *     selectable list of paper cards; the user ticks which to file.
 *  2. useInterrupt — the agent's write-gate pause renders as an approve/edit/reject
 *     card, and resolving it resumes the graph.
 */
export function usePodcastUI() {
  // 1) Search results → selectable paper cards.
  useRenderTool({
    name: "search_arxiv",
    parameters: z.object({ query: z.string(), max_results: z.number().optional() }),
    render: ({ status, parameters, result }) => (
      <SearchResults
        query={parameters?.query ? String(parameters.query) : undefined}
        result={result}
        status={status}
      />
    ),
  });

  // 2) Write-gate interrupt → approval card.
  useInterrupt({
    agentId: "default",
    render: ({ event, resolve }) => <ApprovalCard value={event.value} resolve={resolve} />,
  });
}
