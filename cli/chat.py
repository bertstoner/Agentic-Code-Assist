#!/usr/bin/env python3
"""Agentic Code Assist - CLI Interface

Uses Cerebras API when online, falls back to local Ollama when offline.

Usage:
    python cli/chat.py
    python cli/chat.py --model llama3.2
    python cli/chat.py --theme dark
"""

import argparse
import os
import sys
import socket
from pathlib import Path
from typing import Optional

# Load .env from project root
def load_env():
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())

load_env()

try:
    from rich.console import Console
    from rich.markdown import Markdown
    from rich.panel import Panel
    from rich.live import Live
    from rich.text import Text
    from rich.rule import Rule
    from prompt_toolkit import PromptSession
    from prompt_toolkit.history import FileHistory
    from prompt_toolkit.auto_suggest import AutoSuggestFromHistory
    from openai import OpenAI
except ImportError:
    print("Missing dependencies. Run: pip install -r cli/requirements.txt")
    sys.exit(1)


CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1"
CEREBRAS_DEFAULT_MODEL = "gpt-oss-120b"
OLLAMA_BASE_URL = "http://localhost:11434/v1"
OLLAMA_DEFAULT_MODEL = "llama3.2"

console = Console()


def check_online() -> bool:
    """Check if Cerebras API is reachable."""
    try:
        socket.setdefaulttimeout(3)
        socket.socket(socket.AF_INET, socket.SOCK_STREAM).connect(("api.cerebras.ai", 443))
        # Also verify the API key works
        api_key = os.environ.get("CEREBRAS_API_KEY", "")
        return bool(api_key)
    except Exception:
        return False


def check_ollama() -> bool:
    """Check if Ollama is running locally."""
    try:
        socket.setdefaulttimeout(2)
        socket.socket(socket.AF_INET, socket.SOCK_STREAM).connect(("localhost", 11434))
        return True
    except Exception:
        return False


def get_client(online: bool) -> OpenAI:
    """Return an OpenAI-compatible client for the appropriate backend."""
    if online:
        return OpenAI(
            base_url=CEREBRAS_BASE_URL,
            api_key=os.environ.get("CEREBRAS_API_KEY", ""),
        )
    else:
        return OpenAI(
            base_url=OLLAMA_BASE_URL,
            api_key="ollama",  # Ollama ignores this
        )


def list_models(client: OpenAI, online: bool) -> list[str]:
    """List available models from the active backend."""
    try:
        models = client.models.list()
        return [m.id for m in models.data]
    except Exception:
        return [CEREBRAS_DEFAULT_MODEL if online else OLLAMA_DEFAULT_MODEL]


def print_welcome(online: bool, backend_model: str, ollama_ok: bool):
    """Print the welcome banner."""
    if online:
        status_line = "[bold green]● ONLINE[/bold green]  [dim]→[/dim]  [cyan]Cerebras API[/cyan]"
    elif ollama_ok:
        status_line = "[bold yellow]◌ OFFLINE[/bold yellow]  [dim]→[/dim]  [yellow]Ollama (local)[/yellow]"
    else:
        status_line = "[bold red]◌ OFFLINE[/bold red]  [dim]→[/dim]  [red]No backend available[/red]"

    console.print(Panel(
        f"[bold white]Agentic Code Assist[/bold white]  [dim]CLI[/dim]\n\n"
        f"Status : {status_line}\n"
        f"Model  : [bold]{backend_model}[/bold]\n\n"
        "[dim]Commands: /help  /status  /model <name>  /clear  /exit[/dim]",
        border_style="cyan",
        title="[bold cyan]AGENT[/bold cyan]",
        title_align="left",
    ))


def print_help():
    console.print(Panel(
        "/help              Show this help\n"
        "/status            Show current backend and model\n"
        "/model <name>      Switch model\n"
        "/models            List available models\n"
        "/clear             Clear conversation history\n"
        "/exit              Quit",
        title="Commands",
        border_style="dim",
    ))


def run(model_override: Optional[str] = None, theme: str = "default"):
    online = check_online()
    ollama_ok = check_ollama() if not online else False

    if not online and not ollama_ok:
        console.print("[bold red]No backend available.[/bold red] Cerebras is unreachable and Ollama is not running.")
        console.print("Start Ollama with: [bold]ollama serve[/bold]")
        sys.exit(1)

    client = get_client(online)
    default_model = CEREBRAS_DEFAULT_MODEL if online else OLLAMA_DEFAULT_MODEL
    current_model = model_override or default_model

    print_welcome(online, current_model, ollama_ok)

    # History file
    history_dir = Path.home() / ".agentcodeassist"
    history_dir.mkdir(parents=True, exist_ok=True)
    session = PromptSession(
        history=FileHistory(str(history_dir / "history")),
        auto_suggest=AutoSuggestFromHistory(),
    )

    messages: list[dict] = []

    while True:
        try:
            prefix = "ONLINE ➜ " if online else "OFFLINE ➜ "
            user_input = session.prompt(prefix).strip()

            if not user_input:
                continue

            # --- Commands ---
            if user_input.startswith("/"):
                parts = user_input.split()
                cmd = parts[0].lower()

                if cmd == "/exit":
                    break
                elif cmd == "/help":
                    print_help()
                elif cmd == "/clear":
                    messages.clear()
                    console.print("[dim]Conversation cleared.[/dim]")
                elif cmd == "/status":
                    backend = "Cerebras" if online else "Ollama"
                    color = "green" if online else "yellow"
                    console.print(f"[{color}]{'ONLINE' if online else 'OFFLINE'}[/] → {backend}  |  Model: [bold]{current_model}[/bold]")
                elif cmd == "/models":
                    model_list = list_models(client, online)
                    console.print("[dim]Available models:[/dim]")
                    for m in model_list:
                        marker = "[cyan]▸[/cyan] " if m == current_model else "  "
                        console.print(f"  {marker}{m}")
                elif cmd == "/model":
                    if len(parts) < 2:
                        console.print("[yellow]Usage: /model <name>[/yellow]")
                    else:
                        current_model = parts[1]
                        console.print(f"[dim]Model set to[/dim] [bold]{current_model}[/bold]")
                else:
                    console.print(f"[yellow]Unknown command: {cmd}. Type /help for commands.[/yellow]")
                continue

            # --- Chat ---
            messages.append({"role": "user", "content": user_input})

            console.print()
            console.print("[bold cyan]⚡ AGENT[/bold cyan]")

            full_response = ""
            try:
                with Live(Text(""), refresh_per_second=15, console=console) as live:
                    stream = client.chat.completions.create(
                        model=current_model,
                        messages=messages,
                        stream=True,
                        max_tokens=8192,
                    )
                    for chunk in stream:
                        delta = chunk.choices[0].delta.content or ""
                        full_response += delta
                        try:
                            live.update(Markdown(full_response))
                        except Exception:
                            live.update(Text(full_response))

            except Exception as e:
                console.print(f"[bold red]Error:[/bold red] {e}")
                messages.pop()  # Remove failed user message
                console.print()
                continue

            messages.append({"role": "assistant", "content": full_response})
            console.print()
            console.print(Rule(style="dim"))
            console.print()

        except KeyboardInterrupt:
            console.print("\n[dim]Interrupted. Type /exit to quit.[/dim]")
            continue
        except EOFError:
            break

    console.print("\n[dim]Goodbye.[/dim]")


def main():
    parser = argparse.ArgumentParser(description="Agentic Code Assist CLI")
    parser.add_argument("--model", "-m", help="Override the default model")
    parser.add_argument("--theme", default="default", choices=["default", "dark", "minimal"],
                        help="Color theme (default: default)")
    args = parser.parse_args()
    run(model_override=args.model, theme=args.theme)


if __name__ == "__main__":
    main()
