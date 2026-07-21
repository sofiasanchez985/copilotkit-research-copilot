"""AG-UI backend for the deep-agents-podcast research agent.

This mounts Track 2's deep research agent behind an AG-UI HTTP endpoint so a
CopilotKit frontend can talk to it. The standalone ``agent/agent.py`` in the
podcast repo relies on ``langgraph dev`` to inject a checkpointer and store; we
are NOT running under langgraph dev, so we build the agent here with an explicit
checkpointer + SQLite store.

The key thing this preserves is ``interrupt_on={"write_file": ...}`` — the deep
agent pauses before writing anything into the library, and that pause surfaces
through AG-UI as an interrupt the frontend's ``useInterrupt`` hook can render as
an approve / edit / reject card.
"""

from __future__ import annotations

import os
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPO = PROJECT_ROOT / "deep-agents-podcast"
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

# Load API keys from the ONE project-root .env, before importing utils.models
# (which otherwise tries to load its own copy). This keeps a single place for
# keys: track1-podcast-ui/.env.
from dotenv import load_dotenv

load_dotenv(PROJECT_ROOT / ".env", override=True)

from ag_ui_langgraph import add_langgraph_fastapi_endpoint
from copilotkit import LangGraphAGUIAgent
from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, FilesystemBackend, StoreBackend
from fastapi import FastAPI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.store.memory import InMemoryStore

from utils.arxiv_tools import get_arxiv_paper, search_arxiv
from utils.memory import MEMORY_NAMESPACE
from utils.models import model, sub_agent_model
from utils.search import tavily_search

AGENT_DIR = REPO / "agent"

# The AG-UI server runs the graph ASYNCHRONOUSLY. Track 2's notebook uses a
# synchronous SqliteStore (fine for `agent.invoke`), but under async execution
# that store raises NotImplementedError on `aget`/`aput`. InMemoryStore supports
# async natively and needs no setup — the library lives for the session (which
# is all we need; Colab kernels are ephemeral anyway).

# Silence LangSmith's 403 spam when no real tracing key is configured.
if not (os.getenv("LANGSMITH_API_KEY") or "").strip() or (os.getenv("LANGSMITH_API_KEY") or "").startswith("<"):
    os.environ.pop("LANGSMITH_API_KEY", None)
    os.environ["LANGSMITH_TRACING"] = "false"

search_scout = {
    "name": "search-scout",
    "description": "Scout arXiv for a topic and return a ranked shortlist of candidate papers. Breadth, not depth.",
    "system_prompt": (
        "You are a literature scout for a computational-longevity library.\n"
        "- Run up to 3 arXiv searches for the requested topic.\n"
        "- Return a ranked shortlist of 3-5 papers: arXiv id, title, and one line\n"
        "  on why each is relevant. Dedupe.\n"
        "- Do not deep-read or file anything — that's the analyst's job."
    ),
    "model": sub_agent_model,
}

paper_analyst = {
    "name": "paper-analyst",
    "description": "Deep-read a single arXiv paper and propose how to file it. Give it one paper at a time.",
    "system_prompt": (
        "You analyze one paper for a computational-longevity research library.\n"
        "- Call get_arxiv_paper if you need the full metadata.\n"
        "- Return: a 2-3 sentence summary of the contribution, a suggested\n"
        "  topic folder in kebab-case (e.g. aging-clocks, senescence), and 3-6\n"
        "  lowercase tags.\n"
        "- Be concise. Do not file anything yourself; just report."
    ),
    "model": sub_agent_model,
}


def build_graph():
    """Build the gated deep agent with an explicit checkpointer + store."""
    store = InMemoryStore()
    backend = CompositeBackend(
        default=FilesystemBackend(root_dir=str(AGENT_DIR), virtual_mode=True),
        routes={"/memories/": StoreBackend(store=store, namespace=lambda rt: MEMORY_NAMESPACE)},
    )
    graph = create_deep_agent(
        model=model,
        tools=[search_arxiv, get_arxiv_paper, tavily_search],
        subagents=[search_scout, paper_analyst],
        system_prompt=(
            "You are a computational-longevity research agent with a library at "
            "/memories/library/. File each approved paper as a markdown entry in "
            "/memories/library/<topic>.md. Check the library before searching so you never "
            "re-file a paper.\n"
            # Presentation note (this app renders tool results as UI, not text):
            "When you call search_arxiv, the app already displays the results to the user as "
            "interactive cards. Do NOT repeat the papers as a numbered list in your reply — "
            "just give a one-line acknowledgement (e.g. 'Here are the results.').\n"
            "If a file write or edit is rejected/cancelled, nothing was saved — never claim you "
            "added, filed, or removed anything in that case; say the action was cancelled."
        ),
        memory=[str(AGENT_DIR / "AGENTS.md")],
        backend=backend,
        store=store,
        checkpointer=MemorySaver(),
        interrupt_on={
            "write_file": {"allowed_decisions": ["approve", "edit", "reject"]},
            "edit_file": {"allowed_decisions": ["approve", "edit", "reject"]},
        },
    )
    return graph, store


import re

# Matches arXiv ids in both modern (2501.02401v1) and legacy (q-bio/0404026) forms.
_ARXIV_ID = re.compile(r"\b(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+/\d{7}(?:v\d+)?)\b")


def _norm_id(arxiv_id: str) -> str:
    return re.sub(r"v\d+$", "", arxiv_id)


def _clean_field(s: str | None) -> str | None:
    """Strip markdown artifacts the model leaves in field values."""
    if not s:
        return s
    s = s.replace("**", "").replace("`", "")
    s = re.sub(r"^\s*\[[\w./:-]+\]\s*", "", s)  # leading "[2501.02401] "
    s = re.sub(r"\s*\((?:arxiv:\s*)?[\w./-]+\)\s*$", "", s, flags=re.IGNORECASE)  # trailing "(id)"
    return s.strip().strip("{},").strip("* ").strip()


def _paper_from_block(block: str, norm_id: str) -> dict:
    """Pull a title/authors/abstract out of one paper's text block."""
    _FIELD_LABELS = ("id", "arxiv id", "authors", "author", "abstract", "title",
                     "published", "year", "pdf", "pdf_url", "primary category",
                     "primary_category", "url", "tags", "note")
    lines = [ln.rstrip() for ln in block.splitlines() if ln.strip()]
    title = ""
    bib = re.search(r"title\s*=\s*\{(.+?)\}", block, re.IGNORECASE)
    if bib:
        title = bib.group(1).strip()
    if not title:
        for m in re.finditer(r"\*\*(.+?)\*\*", block):
            cand = m.group(1).strip().rstrip(":")
            if cand.lower() not in _FIELD_LABELS and len(cand) >= 8:
                title = cand
                break
    if not title:
        fm = re.search(r"(?m)^[-*\s]*\**title\**\s*:\s*(.+)$", block, re.IGNORECASE)
        if fm:
            title = fm.group(1).strip().strip("*")
    if not title:
        for ln in lines:
            low = ln.lower().lstrip("#*- ")
            if low.startswith(_FIELD_LABELS) or low.startswith(("@", "% ", "eprint", "archiveprefix")):
                continue
            cleaned = re.sub(r"^[#*\-\s]+", "", ln).replace("**", "").strip().strip("{},")
            if cleaned.lower() in ("papers", "library") or len(cleaned) < 3:
                continue
            title = cleaned
            break

    def field(*names: str) -> str | None:
        for name in names:
            m = re.search(rf"{name}\**[^:\n]*[:=]\s*(.+)", block, re.IGNORECASE)
            if m:
                return _clean_field(m.group(1))
        return None

    abstract = None
    am = re.search(r"abstract\**[^:\n]*[:\n]\s*(.+)", block, re.IGNORECASE | re.DOTALL)
    if am:
        abstract = _clean_field(" ".join(am.group(1).split())[:600])
    return {
        "id": norm_id,
        "title": _clean_field(title) or norm_id,
        "authors": field("authors", "author"),
        "published": field("published", "year"),
        "abstract": abstract,
        "url": f"https://arxiv.org/abs/{norm_id}",
    }


def _parse_library_papers(md: str) -> list[dict]:
    """Best-effort parse of a topic file into individual papers (for card view).

    The agent's layout varies run to run, and it often appends multiple papers
    under one heading — so splitting on headings would merge them. Instead we
    anchor on the arXiv id (one paper == one distinct id) and cut the file into
    one block per id at the midpoints between consecutive ids, so every paper
    becomes its own card regardless of the surrounding markdown shape.
    """
    ids: list[tuple[str, int]] = []
    seen: set[str] = set()
    for m in _ARXIV_ID.finditer(md):
        norm = _norm_id(m.group(1))
        if norm in seen:
            continue
        seen.add(norm)
        ids.append((norm, m.start()))
    if not ids:
        return []

    # A paper starts at its title — a heading or a bold-title bullet — which sits
    # at or just before its id. Cut each entry at the nearest such "anchor" line
    # before the id (not a naive midpoint), so titles + fields stay with the
    # right paper even when several papers share one heading section.
    # Anchors mark where a paper starts: a heading, or a bold-title bullet like
    # "- **Real Title** (id)". Exclude bold *field* bullets ("- **ID**:",
    # "- **Authors**:", …) — those are inside a paper, not a new one.
    anchor_re = re.compile(
        r"(?im)^[ \t]*(?:"
        r"#{1,3}[ \t]+\S"
        r"|[-*][ \t]*\*\*(?!\s*(?:id|arxiv[ _]?id|authors?|abstract|published|year|pdf|pdf_url|"
        r"link|title|categor\w*|primary\w*|url|tags|note)\s*\*\*)"
        r")"
    )
    anchors = [a.start() for a in anchor_re.finditer(md)]

    starts: list[int] = []
    prev = -1
    for _norm, pos in ids:
        line_start = md.rfind("\n", 0, pos) + 1
        candidates = [a for a in anchors if prev < a <= line_start]
        start = candidates[-1] if candidates else line_start
        if start <= prev:  # keep boundaries strictly increasing
            start = line_start if line_start > prev else prev + 1
        starts.append(start)
        prev = start

    bounds = starts + [len(md)]
    return [_paper_from_block(md[bounds[i]:bounds[i + 1]], ids[i][0]) for i in range(len(ids))]


def _count_papers(md: str) -> int:
    """A best-effort paper count for a topic file.

    Normally this is the number of distinct arXiv ids. But the count also drives
    whether the shelf is shown, so we must never report 0 for a file that has
    real content — otherwise editing a paper into a form without a clean
    ``NNNN.NNNNN`` id would make its whole folder vanish. So: distinct ids if we
    find any; else the number of entry headings; else 1 if there's any content;
    else 0 (a truly-empty file, e.g. after removing the last paper) so it hides.
    """
    ids = {_norm_id(m.group(1)) for m in _ARXIV_ID.finditer(md)}
    if ids:
        return len(ids)
    headings = len(re.findall(r"(?m)^#{1,3}\s+\S", md))
    if headings:
        return headings
    return 1 if md.strip() else 0


def _read_library(store) -> list[dict]:
    """Read the filed library out of the store, grouped by topic.

    The agent files papers to /memories/library/<topic>.md (StoreBackend). Those
    live in the store, not in graph state, so the frontend can't see them via
    shared state — this endpoint surfaces them for the shelf. We return the raw
    markdown of each topic file and let the UI render it, instead of parsing the
    model's (inconsistent) layout into structured fields.
    """
    topics: dict[str, dict] = {}
    try:
        items = store.search(MEMORY_NAMESPACE)
    except Exception:
        items = []
    for item in items:
        key = getattr(item, "key", "") or ""
        if "library/" not in key:
            continue
        topic = key.split("library/")[-1].removesuffix(".md")
        value = getattr(item, "value", {}) or {}
        content = value.get("content")
        if isinstance(content, list):
            content = "\n".join(content)
        content = content or ""
        entry = topics.setdefault(topic, {"topic": topic, "raw": ""})
        entry["raw"] += ("\n\n" + content) if entry["raw"] else content
    shelves = [
        {
            "topic": t["topic"],
            "count": _count_papers(t["raw"]),
            "papers": _parse_library_papers(t["raw"]),
            "raw": t["raw"],
        }
        for t in topics.values()
    ]
    return sorted(shelves, key=lambda s: -s["count"])


def build_app() -> FastAPI:
    graph, store = build_graph()

    # 1. A plain web server to host the agent — the door a browser can reach.
    app = FastAPI()

    # 2. Wrap the LangGraph graph in an AG-UI adapter: it runs the graph and
    #    translates its activity (text, tool calls, state, interrupts) into
    #    standard AG-UI events. The graph itself is unchanged from Track 2.
    agent = LangGraphAGUIAgent(
        name="podcast_agent",
        description="Computational-longevity research agent that curates a paper library.",
        graph=graph,
        # A deep agent (planning + subagents + tool calls) easily exceeds the
        # default 25-step recursion limit; raise it so runs complete.
        config={"recursion_limit": 100},
    )

    # 3. Mount the adapter as an HTTP/SSE endpoint the React frontend connects to.
    add_langgraph_fastapi_endpoint(app=app, agent=agent, path="/")

    @app.get("/library")
    def library():  # the live research library, read straight from the store
        return {"shelves": _read_library(store)}

    return app


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(build_app(), host="0.0.0.0", port=8000, log_level="info")
