import { CopilotChat } from "@copilotkit/react-core/v2";
import { LibraryShelf } from "@/components/library-shelf";
import { usePodcastUI } from "@/hooks/use-podcast-ui";

export default function App() {
  // Register the generative-UI pieces: paper cards + the approval interrupt card.
  usePodcastUI();

  return (
    <div className="flex h-full w-full">
      {/* Main view: the live research library (agent memory made visible). */}
      <div className="min-w-0 flex-1">
        <LibraryShelf />
      </div>

      {/* Sidebar: the chat that drives the deep research agent — frosted glass. */}
      <div className="flex h-full w-[420px] shrink-0 flex-col border-l border-white/60 bg-white/45 backdrop-blur-2xl">
        <div className="px-6 py-4">
          <h2 className="font-display text-lg font-semibold text-[#132a2b]">🎙️ Research Copilot</h2>
          <p className="mt-0.5 text-xs text-[#5b7173]">Find arXiv papers and approve what gets filed into your library.</p>
        </div>
        <div className="min-h-0 flex-1">
          <CopilotChat agentId="default" />
        </div>
      </div>
    </div>
  );
}
