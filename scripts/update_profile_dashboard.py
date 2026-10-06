from __future__ import annotations

import html
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

API_ROOT = "https://api.github.com"
GRAPHQL_URL = "https://api.github.com/graphql"
OUT_DIR = Path("assets/profile/generated")
PROFILE_REPO = "SMRI2170"
STATIC_PREFIXES = ("Official-Website-of-",)

LEAF_PATH = "M63.81 192.19c-47.89-79.81 16-159.62 151.64-151.64C223.43 176.23 143.62 240.08 63.81 192.19Z"
LEAF_LINE = "M160 96 L40 216"


def api_get(path: str, token: str):
    req = Request(
        f"{API_ROOT}{path}",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "SMRI2170-digital-garden",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urlopen(req, timeout=25) as response:
        return json.load(response)


def graphql(query: str, variables: dict, token: str):
    payload = json.dumps({"query": query, "variables": variables}).encode("utf-8")
    req = Request(
        GRAPHQL_URL,
        data=payload,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "SMRI2170-digital-garden",
        },
        method="POST",
    )
    with urlopen(req, timeout=25) as response:
        result = json.load(response)
    if result.get("errors"):
        raise RuntimeError(f"GitHub GraphQL error: {result['errors']}")
    return result["data"]


def collect_contributions(owner: str, token: str) -> dict:
    query = """
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              firstDay
              contributionDays {
                date
                contributionCount
                weekday
              }
            }
          }
        }
      }
    }
    """
    data = graphql(query, {"login": owner}, token)
    calendar = data["user"]["contributionsCollection"]["contributionCalendar"]
    days = [d for w in calendar["weeks"] for d in w["contributionDays"]]
    return {"total": int(calendar["totalContributions"]), "weeks": calendar["weeks"], "days": days}


def streak_stats(days: list[dict]) -> tuple[int, int]:
    counts = {datetime.fromisoformat(d["date"]).date(): int(d["contributionCount"]) for d in days}
    if not counts:
        return 0, 0
    ordered = sorted(counts)
    cursor = ordered[-1]
    if counts.get(cursor, 0) == 0:
        cursor -= timedelta(days=1)
    current = 0
    while counts.get(cursor, 0) > 0:
        current += 1
        cursor -= timedelta(days=1)
    recent_cutoff = ordered[-1] - timedelta(days=29)
    active30 = sum(1 for d, value in counts.items() if d >= recent_cutoff and value > 0)
    return current, active30


def list_public_repos(owner: str, token: str) -> list[dict]:
    repos = []
    for page in range(1, 6):
        items = api_get(
            f"/users/{quote(owner)}/repos?type=owner&sort=pushed&direction=desc&per_page=100&page={page}",
            token,
        )
        if not items:
            break
        repos.extend(items)
        if len(items) < 100:
            break
    return [r for r in repos if not r.get("fork") and not r.get("archived") and not r.get("private")]


def include_repo(repo: dict) -> bool:
    name = repo.get("name", "")
    return name != PROFILE_REPO and not any(name.startswith(p) for p in STATIC_PREFIXES)


def count_recent_commits(owner: str, repos: list[dict], token: str) -> int:
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat().replace("+00:00", "Z")
    total = 0
    for repo in repos:
        if not include_repo(repo):
            continue
        for page in range(1, 4):
            commits = api_get(
                f"/repos/{quote(owner)}/{quote(repo['name'])}/commits?author={quote(owner)}&since={quote(since)}&per_page=100&page={page}",
                token,
            )
            total += len(commits)
            if len(commits) < 100:
                break
    return total


def search_count(query: str, token: str) -> int:
    result = api_get(f"/search/issues?q={quote(query)}&per_page=1", token)
    return int(result.get("total_count", 0))


def palette(dark: bool) -> dict[str, str]:
    if dark:
        return {
            "bg": "#08110C", "panel": "#0E1B13", "soft": "#13251A",
            "text": "#EEF4EB", "muted": "#9CAF9A", "border": "#294532",
            "moss": "#6F936B", "sage": "#9BB594", "fern": "#4F7D5B",
            "water": "#79AEB2", "sun": "#D5B96C",
        }
    return {
        "bg": "#F3F1E7", "panel": "#FBFAF3", "soft": "#E9EEE4",
        "text": "#263329", "muted": "#687667", "border": "#C3CDBE",
        "moss": "#597D5A", "sage": "#789A76", "fern": "#356348",
        "water": "#5A969C", "sun": "#B89347",
    }


def leaf(x: float, y: float, scale: float, color: str, opacity: float = 1.0, rotate: float = 0.0) -> str:
    return (
        f'<g transform="translate({x} {y}) rotate({rotate}) scale({scale})" opacity="{opacity}" '
        f'fill="none" stroke="{color}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">'
        f'<path d="{LEAF_PATH}"/><path d="{LEAF_LINE}"/></g>'
    )


def growth_svg(owner: str, repos: list[dict], contributions: dict, commits30: int, prs: int, dark: bool) -> str:
    p = palette(dark)
    font = "-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"
    mono = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"
    current_streak, active30 = streak_stats(contributions["days"])

    weeks = contributions["weeks"][-12:]
    week_totals = [sum(int(d["contributionCount"]) for d in w["contributionDays"]) for w in weeks]
    max_week = max(week_totals) if week_totals else 1

    stems = []
    base_y = 300
    for idx, value in enumerate(week_totals):
        x = 70 + idx * 48
        height = 24 + int(100 * value / max_week) if max_week else 24
        top = base_y - height
        color = [p["fern"], p["moss"], p["sage"]][idx % 3]
        stems.append(f'<path d="M{x} {base_y} C{x-3} {base_y-32} {x+4} {top+28} {x} {top}" fill="none" stroke="{color}" stroke-width="3" stroke-linecap="round"/>')
        if value > 0:
            stems.append(leaf(x - 21, top + 8, 0.085, color, 0.85, -22))
            if value >= max(2, max_week // 3):
                stems.append(leaf(x + 7, top + 24, 0.075, p["sage"], 0.72, 24))
            stems.append(f'<circle cx="{x}" cy="{top}" r="3.5" fill="{p["sun"]}"><animate attributeName="opacity" values=".35;1;.35" dur="{2.8 + idx * 0.12:.2f}s" repeatCount="indefinite"/></circle>')

    stats = [
        ("COMMITS 30D", commits30, p["moss"]),
        ("REPOSITORIES", len(repos), p["fern"]),
        ("PULL REQUESTS", prs, p["water"]),
        ("STREAK", f"{current_streak}d", p["sage"]),
        ("ACTIVE 30D", active30, p["sun"]),
    ]
    blocks = []
    xs = [54, 184, 326, 466, 574]
    for (label, value, color), x in zip(stats, xs):
        blocks.append(f'<text x="{x}" y="102" fill="{color}" font-family="{font}" font-size="25" font-weight="800">{html.escape(str(value))}</text>')
        blocks.append(f'<text x="{x}" y="122" fill="{p["muted"]}" font-family="{mono}" font-size="9.5" font-weight="700">{label}</text>')

    return f'''<svg width="720" height="350" viewBox="0 0 720 350" xmlns="http://www.w3.org/2000/svg">
  <rect width="720" height="350" rx="26" fill="{p["bg"]}"/>
  <rect x="1" y="1" width="718" height="348" rx="25" fill="none" stroke="{p["border"]}" stroke-width="2"/>
  {leaf(22, 9, 0.12, p["moss"], 0.9, -12)}
  <text x="64" y="45" fill="{p["text"]}" font-family="{font}" font-size="18" font-weight="800">Growth</text>
  <text x="125" y="45" fill="{p["muted"]}" font-family="{font}" font-size="13">GitHub activity · updated daily</text>
  {''.join(blocks)}
  <line x1="54" y1="145" x2="666" y2="145" stroke="{p["border"]}"/>
  <text x="54" y="171" fill="{p["muted"]}" font-family="{mono}" font-size="10" font-weight="700">LAST 12 WEEKS · {contributions["total"]} CONTRIBUTIONS / YEAR</text>
  {''.join(stems)}
  <path d="M52 302 C165 294 268 310 374 300 C470 291 565 305 668 298" fill="none" stroke="{p["border"]}" stroke-width="2"/>
</svg>'''


def write_if_changed(path: Path, content: str) -> bool:
    if path.exists() and path.read_text(encoding="utf-8") == content:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return True


def main() -> int:
    token = os.environ.get("GITHUB_TOKEN")
    owner = os.environ.get("PROFILE_OWNER")
    if not token or not owner:
        print("GITHUB_TOKEN and PROFILE_OWNER are required", file=sys.stderr)
        return 2

    repos = list_public_repos(owner, token)
    contributions = collect_contributions(owner, token)
    commits30 = count_recent_commits(owner, repos, token)
    prs = search_count(f"author:{owner} type:pr", token)

    generated = {
        OUT_DIR / "growth-dark.svg": growth_svg(owner, repos, contributions, commits30, prs, True),
        OUT_DIR / "growth-light.svg": growth_svg(owner, repos, contributions, commits30, prs, False),
    }

    changed = False
    for path, content in generated.items():
        changed = write_if_changed(path, content) or changed

    print("Updated profile growth assets." if changed else "Profile growth assets are already up to date.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
