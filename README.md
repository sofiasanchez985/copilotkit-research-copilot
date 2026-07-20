# 🎙️ Research Copilot — Agentic UIs with CopilotKit

A workshop that gives a **face** to the deep research agent from
[deep-agents-podcast](https://github.com/marta-langchain/deep-agents-podcast) (Track 2).

You build a web app — a live research **library**, a **CopilotKit** chat sidebar, streaming
**paper cards**, and one-click **approve / reject** — on the [AG-UI](https://docs.ag-ui.com)
protocol, **without modifying the agent at all**. The whole workshop is about the *interaction
layer*.

## Run it

Two ways — pick one:

- **Google Colab (recommended — nothing to install):** open the notebook, add your keys, run the
  setup cell.
  👉 [**Open in Colab**](https://colab.research.google.com/github/sofiasanchez985/copilotkit-research-copilot/blob/main/research_copilot_colab.ipynb)

- **Your own machine:** clone this repo, then:
  ```bash
  git clone https://github.com/marta-langchain/deep-agents-podcast.git
  python -m venv .venv && source .venv/bin/activate
  pip install -e ./deep-agents-podcast -r requirements.txt
  cp .env.example .env        # add your keys
  # terminal 1 — the AG-UI agent backend:
  uvicorn backend.server:build_app --factory --port 8000
  # terminal 2 — the React frontend:
  cd frontend && npm install && npm run dev
  ```
  Open http://localhost:5173.

## Keys you'll need

- **[Google AI Studio](https://aistudio.google.com/apikey)** — `GOOGLE_API_KEY`, Gemini on the
  free tier (**required**). No credit card.
- **[Tavily](https://tavily.com)** — `TAVILY_API_KEY`, web search for the agent (**required**,
  free tier).
- **[LangSmith](https://smith.langchain.com)** — `LANGSMITH_API_KEY`, tracing (**optional**).

In Colab, add these to **Secrets** (🔑) or the setup cell will prompt you.

## What's inside

```
research_copilot_colab.ipynb   the workshop (concepts → code → diagrams)
backend/server.py              mounts the Track 2 agent on an AG-UI endpoint + a /library reader
frontend/                      Vite + React + @copilotkit/react-core/v2 (the UI you build)
workshop_helpers.py            Colab plumbing: Node install, servers, iframe
```

The agent itself is **cloned at setup time** from
[deep-agents-podcast](https://github.com/marta-langchain/deep-agents-podcast) — this repo never
forks or changes it.

## The CopilotKit concepts it teaches

| Hook / API | What it does here |
|---|---|
| `LangGraphAGUIAgent` | expose the LangGraph agent over AG-UI |
| `<CopilotKit>` + `<CopilotChat>` | connect a React app directly (no runtime) |
| `useRenderTool` | render `search_arxiv` results as paper cards |
| `useAgent` | drive the agent from UI events; read `agent.state` |
| `useInterrupt` ⭐ | turn the agent's write-gate into an approve/reject card |

Built with [CopilotKit](https://docs.copilotkit.ai) on [AG-UI](https://docs.ag-ui.com).
