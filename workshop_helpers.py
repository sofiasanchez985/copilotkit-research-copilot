"""Small helpers for running the Research Copilot workshop in Google Colab.

These keep the notebook cells focused on concepts: installing Node, loading API
keys, starting the two servers (the AG-UI agent backend + the Vite/React frontend)
and embedding the running app in an inline iframe.
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT / "frontend"


# ── environment detection ────────────────────────────────────────────
def in_colab() -> bool:
    return "google.colab" in sys.modules


# ── API keys ─────────────────────────────────────────────────────────
def load_keys() -> None:
    """Load API keys from Colab Secrets (🔑) or prompt, into os.environ.

    GOOGLE_API_KEY and TAVILY_API_KEY are required; LANGSMITH_API_KEY is optional
    (adds tracing). Run this before starting the backend.
    """
    from getpass import getpass

    def _get(name: str, required: bool) -> str | None:
        if os.environ.get(name):
            return os.environ[name]
        if in_colab():
            try:
                from google.colab import userdata

                val = userdata.get(name)
                if val:
                    return val
            except Exception:
                pass
        if required:
            return getpass(f"{name} (free — see the README): ")
        return None

    for key in ("GOOGLE_API_KEY", "TAVILY_API_KEY"):
        val = _get(key, required=True)
        if val:
            os.environ[key] = val
            print(f"✓ {key} loaded")

    ls = _get("LANGSMITH_API_KEY", required=False)
    if ls:
        os.environ["LANGSMITH_API_KEY"] = ls
        os.environ["LANGSMITH_TRACING"] = "true"
        print("✓ LANGSMITH_API_KEY loaded (tracing on)")
    else:
        os.environ["LANGSMITH_TRACING"] = "false"


# ── Node.js ──────────────────────────────────────────────────────────
def ensure_node(major: int = 20) -> None:
    """Make sure a recent Node.js is available (Colab ships an old one or none)."""
    try:
        out = subprocess.run(["node", "-v"], capture_output=True, text=True)
        current = int(out.stdout.strip().lstrip("v").split(".")[0])
        if out.returncode == 0 and current >= major:
            print(f"✓ Node {out.stdout.strip()} already available")
            return
    except (FileNotFoundError, ValueError):
        pass
    print(f"Installing Node {major}.x … (about a minute)")
    subprocess.run(
        f"curl -fsSL https://deb.nodesource.com/setup_{major}.x | sudo -E bash - "
        "&& sudo apt-get install -y nodejs",
        shell=True,
        check=True,
    )
    print("✓ Node installed:", subprocess.run(["node", "-v"], capture_output=True, text=True).stdout.strip())


# ── ports ────────────────────────────────────────────────────────────
def _port_up(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _wait_for_port(port: int, timeout: int = 90) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if _port_up(port):
            return True
        time.sleep(0.5)
    return False


_procs: dict[int, subprocess.Popen] = {}


def _start(port: int, cmd: list[str], cwd: Path, log: str) -> None:
    if _port_up(port):
        print(f"• port {port} already serving — reusing")
        return
    logf = open(ROOT / log, "w")
    _procs[port] = subprocess.Popen(cmd, cwd=str(cwd), env=os.environ.copy(), stdout=logf, stderr=subprocess.STDOUT)


# ── servers ──────────────────────────────────────────────────────────
def start_backend(port: int = 8000) -> None:
    """Start the FastAPI AG-UI backend (the deep agent behind an AG-UI endpoint)."""
    _start(port, [sys.executable, "-m", "uvicorn", "backend.server:build_app", "--factory",
                  "--host", "0.0.0.0", "--port", str(port), "--log-level", "warning"], ROOT, "backend-log.txt")
    print("✓ Agent backend on :%d" % port if _wait_for_port(port) else
          "⚠ backend slow to start — check backend-log.txt")


def start_frontend(port: int = 5173) -> None:
    """Start the Vite/React frontend (installs npm deps on first run)."""
    if not (FRONTEND / "node_modules").exists():
        print("Installing frontend dependencies … (a couple of minutes, first run only)")
        subprocess.run(["npm", "install"], cwd=str(FRONTEND), check=True)
    _start(port, ["npm", "run", "dev", "--", "--port", str(port)], FRONTEND, "frontend-log.txt")
    print("✓ Frontend on :%d" % port if _wait_for_port(port) else
          "⚠ frontend slow to start — check frontend-log.txt")


def show_mermaid(code: str) -> None:
    """Render a Mermaid diagram inline via mermaid.ink (needs internet; Colab has it)."""
    import base64

    from IPython.display import Image, display

    encoded = base64.urlsafe_b64encode(code.strip().encode("utf-8")).decode("ascii")
    display(Image(url=f"https://mermaid.ink/img/{encoded}?type=png"))


def show_app(port: int = 5173, height: int = 640) -> None:
    """Embed the running app inline (Colab proxy) or print the local URL."""
    if in_colab():
        from google.colab.output import serve_kernel_port_as_iframe

        serve_kernel_port_as_iframe(port, height=f"{height}px")
    else:
        from IPython.display import IFrame, display

        display(IFrame(src=f"http://localhost:{port}", width="100%", height=height))
