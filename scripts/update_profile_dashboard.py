from __future__ import annotations

import html
import json
import os
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

API_ROOT = "https://api.github.com"
GRAPHQL_URL = "https://api.github.com/graphql"
OUT_DIR = Path("assets/profile/generated")
PROFILE_REPO = "SMRI2170"
STATIC_PREFIXES = ("Official-Website-of-",)
MAX_LANGUAGES = 5


def api_get(path: str, token: str):
    req = Request(
        f"{API_ROOT}{path}",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "SMRI2170-profile-dashboard",
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
            "User-Agent": "SMRI2170-profile-dashboard",
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
                contributionLevel
                weekday
              }
            }
          }
        }
      }
    }
    """
    data = graphql(query, {"login": owner}, token)
    user = data.get("user")
    if not user:
        raise RuntimeError(f"GitHub user not found: {owner}")

    calendar = user["contributionsCollection"]["contributionCalendar"]
    weeks = calendar.get("weeks", [])
    days = [
        day
        for week in weeks
        for day in week.get("contributionDays", [])
    ]
    return {
        "total": int(calendar.get("totalContributions", 0)),
        "weeks": weeks,
        "days": days,
    }


def streak_stats(days: list[dict]) -> tuple[int, int, int]:
    counts = {
        datetime.fromisoformat(day["date"]).date(): int(day["contributionCount"])
        for day in days
    }
    if not counts:
        return 0, 0, 0

    ordered = sorted(counts)
    active_days = sum(1 for value in counts.values() if value > 0)

    longest = 0
    run = 0
    previous = None
    for current in ordered:
        if counts[current] > 0 and (previous is None or (current - previous).days == 1):
            run += 1
        elif counts[current] > 0:
            run = 1
        else:
            run = 0
        longest = max(longest, run)
        previous = current

    cursor = ordered[-1]
    if counts.get(cursor, 0) == 0:
        cursor -= timedelta(days=1)

    current_streak = 0
    while counts.get(cursor, 0) > 0:
        current_streak += 1
        cursor -= timedelta(days=1)

    return current_streak, longest, active_days


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def list_public_repos(owner: str, token: str) -> list[dict]:
    repos = []
    for page in range(1, 6):
        page_items = api_get(
            f"/users/{quote(owner)}/repos?type=owner&sort=pushed&direction=desc&per_page=100&page={page}",
            token,
        )
        if not page_items:
            break
        repos.extend(page_items)
        if len(page_items) < 100:
            break

    return [
        repo
        for repo in repos
        if not repo.get("fork") and not repo.get("archived") and not repo.get("private")
    ]


def search_count(query: str, token: str) -> int:
    result = api_get(f"/search/issues?q={quote(query)}&per_page=1", token)
    return int(result.get("total_count", 0))


def count_recent_commits(owner: str, repos: list[dict], token: str, cutoff: datetime) -> int:
    since = cutoff.isoformat().replace("+00:00", "Z")
    total = 0

    for repo in repos:
        if not include_for_languages(repo):
            continue

        for page in range(1, 4):
            commits = api_get(
                f"/repos/{quote(owner)}/{quote(repo['name'])}/commits"
                f"?author={quote(owner)}&since={quote(since)}&per_page=100&page={page}",
                token,
            )
            total += len(commits)
            if len(commits) < 100:
                break

    return total


def collect_stats(owner: str, repos: list[dict], token: str) -> list[tuple[str, int | str]]:
    now = datetime.now(timezone.utc)
    active_cutoff = now - timedelta(days=30)

    active = sum(
        1
        for repo in repos
        if repo.get("pushed_at") and parse_time(repo["pushed_at"]) >= active_cutoff
    )
    commits_30d = count_recent_commits(owner, repos, token, active_cutoff)

    prs = search_count(f"author:{owner} type:pr", token)
    issues = search_count(f"author:{owner} type:issue", token)

    return [
        ("Repositories", len(repos)),
        ("Commits 30d", commits_30d),
        ("Active 30d", active),
        ("Pull Requests", prs),
        ("Issues", issues),
    ]


def include_for_languages(repo: dict) -> bool:
    name = repo.get("name", "")
    if name == PROFILE_REPO:
        return False
    if any(name.startswith(prefix) for prefix in STATIC_PREFIXES):
        return False
    return True


def collect_languages(owner: str, repos: list[dict], token: str) -> list[tuple[str, int]]:
    totals: Counter[str] = Counter()

    for repo in repos:
        if not include_for_languages(repo):
            continue

        languages = api_get(
            f"/repos/{quote(owner)}/{quote(repo['name'])}/languages",
            token,
        )
        for language, size in languages.items():
            totals[language] += int(size)

    if not totals:
        return []

    top = totals.most_common(MAX_LANGUAGES)
    used = sum(size for _, size in top)
    other = sum(totals.values()) - used
    if other > 0:
        top.append(("Other", other))
    return top


def theme(dark: bool) -> dict[str, str]:
    if dark:
        return {
            "bg": "#0D1117",
            "border": "#30363D",
            "text": "#F0F6FC",
            "muted": "#8B949E",
            "track": "#21262D",
            "accent1": "#8B5CF6",
            "accent2": "#3B82F6",
            "level1": "#312E81",
            "level2": "#4338CA",
            "level3": "#6366F1",
            "level4": "#8B5CF6",
        }
    return {
        "bg": "#FFFFFF",
        "border": "#D0D7DE",
        "text": "#1F2328",
        "muted": "#57606A",
        "track": "#EAEEF2",
        "accent1": "#7C3AED",
        "accent2": "#2563EB",
        "level1": "#DDD6FE",
        "level2": "#A78BFA",
        "level3": "#7C3AED",
        "level4": "#4F46E5",
    }


PALETTE = ["#8B5CF6", "#3B82F6", "#06B6D4", "#10B981", "#F59E0B", "#6B7280"]
# PROFILE_MOTION_V1: generated README SVGs include lightweight SMIL motion.
# PROFILE_DEPTH_V2: dashboard panels and contribution cells use pseudo-3D geometry.


def stats_svg(metrics: list[tuple[str, int | str]], dark: bool) -> str:
    t = theme(dark)
    positions = [
        (56, 132),
        (276, 132),
        (496, 132),
        (166, 244),
        (386, 244),
    ]
    blocks = []
    for (label, value), (x, y) in zip(metrics, positions):
        blocks.append(
            f'<text x="{x}" y="{y}" fill="{t["text"]}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="38" font-weight="800">{html.escape(str(value))}</text>'
        )
        blocks.append(
            f'<text x="{x}" y="{y + 30}" fill="{t["muted"]}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="17" font-weight="600">{html.escape(label)}</text>'
        )

    return f'''<svg width="720" height="360" viewBox="0 0 720 360" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="accent" x1="48" y1="24" x2="672" y2="336" gradientUnits="userSpaceOnUse">
      <stop stop-color="{t["accent1"]}"/>
      <stop offset="1" stop-color="{t["accent2"]}"/>
    </linearGradient>
  </defs>
  <rect width="720" height="360" rx="28" fill="{t["bg"]}"/>
  <rect x="1" y="1" width="718" height="358" rx="27" fill="none" stroke="{t["border"]}" stroke-width="2"/>
  <circle cx="54" cy="48" r="6" fill="url(#accent)"/>
  <text x="74" y="56" fill="{t["muted"]}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="18" font-weight="700" letter-spacing="2">GITHUB STATS</text>
  {''.join(blocks)}
  <rect x="48" y="308" width="624" height="4" rx="2" fill="url(#accent)"/>
  <text x="48" y="335" fill="{t["muted"]}" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="14">public · owned · non-fork · non-archived</text>
</svg>'''


def languages_svg(items: list[tuple[str, int]], dark: bool) -> str:
    t = theme(dark)

    if not items:
        items = [("No language data", 1)]

    total = sum(size for _, size in items)
    rows = []
    y = 108
    for idx, (name, size) in enumerate(items):
        pct = (size / total) * 100 if total else 0
        bar_width = max(2, int(360 * pct / 100))
        color = PALETTE[idx % len(PALETTE)]
        safe_name = html.escape(name)
        rows.append(
            f'<text x="52" y="{y}" fill="{t["text"]}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="18" font-weight="700">{safe_name}</text>'
        )
        rows.append(
            f'<text x="668" y="{y}" text-anchor="end" fill="{t["muted"]}" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="16">{pct:.1f}%</text>'
        )
        rows.append(
            f'<rect x="220" y="{y - 15}" width="360" height="13" rx="6.5" fill="{t["track"]}"/>'
        )
        rows.append(
            f'<rect x="220" y="{y - 15}" width="{bar_width}" height="13" rx="6.5" fill="{color}"/>'
        )
        y += 38

    return f'''<svg width="720" height="360" viewBox="0 0 720 360" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="accent" x1="48" y1="24" x2="672" y2="336" gradientUnits="userSpaceOnUse">
      <stop stop-color="{t["accent1"]}"/>
      <stop offset="1" stop-color="{t["accent2"]}"/>
    </linearGradient>
  </defs>
  <rect width="720" height="360" rx="28" fill="{t["bg"]}"/>
  <rect x="1" y="1" width="718" height="358" rx="27" fill="none" stroke="{t["border"]}" stroke-width="2"/>
  <circle cx="54" cy="48" r="6" fill="url(#accent)"/>
  <text x="74" y="56" fill="{t["muted"]}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="18" font-weight="700" letter-spacing="2">MOST USED LANGUAGES</text>
  {''.join(rows)}
  <text x="48" y="335" fill="{t["muted"]}" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="14">public source repos · static sites excluded</text>
</svg>'''


def contribution_svg(contributions: dict, dark: bool) -> str:
    t = theme(dark)
    weeks = contributions["weeks"][-53:]
    current_streak, longest_streak, active_days = streak_stats(contributions["days"])

    level_colors = {
        "NONE": t["track"],
        "FIRST_QUARTILE": t["level1"],
        "SECOND_QUARTILE": t["level2"],
        "THIRD_QUARTILE": t["level3"],
        "FOURTH_QUARTILE": t["level4"],
    }

    cells = []
    month_labels = []
    previous_month = None

    for week_index, week in enumerate(weeks):
        x = 54 + week_index * 17
        first_day = datetime.fromisoformat(week["firstDay"]).date()
        if first_day.month != previous_month and first_day.day <= 7:
            month_labels.append(
                f'<text x="{x}" y="88" fill="{t["muted"]}" '
                f'font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" '
                f'font-size="13">{first_day.strftime("%b")}</text>'
            )
            previous_month = first_day.month

        for day in week.get("contributionDays", []):
            weekday = int(day["weekday"])
            y = 104 + weekday * 17
            level = day.get("contributionLevel", "NONE")
            count = int(day.get("contributionCount", 0))
            color = level_colors.get(level, t["track"])
            cells.append(
                f'<rect x="{x}" y="{y}" width="12" height="12" rx="3" fill="{color}">'
                f'<title>{html.escape(day["date"])} · {count} contributions</title></rect>'
            )

    stat_items = [
        ("TOTAL", contributions["total"]),
        ("CURRENT", f"{current_streak}d"),
        ("LONGEST", f"{longest_streak}d"),
        ("ACTIVE DAYS", active_days),
    ]
    stat_blocks = []
    stat_x = [1015, 1150, 1285, 1015]
    stat_y = [140, 140, 140, 245]
    label_y = [166, 166, 166, 271]
    for (label, value), x, y, ly in zip(stat_items, stat_x, stat_y, label_y):
        stat_blocks.append(
            f'<text x="{x}" y="{y}" fill="{t["text"]}" '
            f'font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" '
            f'font-size="34" font-weight="800">{html.escape(str(value))}</text>'
        )
        stat_blocks.append(
            f'<text x="{x}" y="{ly}" fill="{t["muted"]}" '
            f'font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" '
            f'font-size="14" font-weight="700" letter-spacing="1">{label}</text>'
        )

    legend_x = 54
    legend_y = 274
    legend = [
        f'<text x="{legend_x}" y="{legend_y + 11}" fill="{t["muted"]}" '
        f'font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="13">less</text>'
    ]
    for idx, key in enumerate(["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"]):
        legend.append(
            f'<rect x="{legend_x + 34 + idx * 18}" y="{legend_y}" width="12" height="12" rx="3" '
            f'fill="{level_colors[key]}"/>'
        )
    legend.append(
        f'<text x="{legend_x + 128}" y="{legend_y + 11}" fill="{t["muted"]}" '
        f'font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="13">more</text>'
    )

    return f'''<svg width="1440" height="360" viewBox="0 0 1440 360" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="accent" x1="54" y1="24" x2="1386" y2="336" gradientUnits="userSpaceOnUse">
      <stop stop-color="{t["accent1"]}"/>
      <stop offset="1" stop-color="{t["accent2"]}"/>
    </linearGradient>
  </defs>
  <rect width="1440" height="360" rx="28" fill="{t["bg"]}"/>
  <rect x="1" y="1" width="1438" height="358" rx="27" fill="none" stroke="{t["border"]}" stroke-width="2"/>
  <circle cx="54" cy="48" r="6" fill="url(#accent)"/>
  <text x="74" y="56" fill="{t["muted"]}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="18" font-weight="700" letter-spacing="2">CONTRIBUTION PULSE</text>
  <text x="54" y="78" fill="{t["muted"]}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="13">rolling GitHub contribution calendar</text>
  {''.join(month_labels)}
  {''.join(cells)}
  {''.join(legend)}
  <line x1="972" y1="92" x2="972" y2="282" stroke="{t["border"]}" stroke-width="1"/>
  {''.join(stat_blocks)}
  <rect x="54" y="312" width="1332" height="4" rx="2" fill="url(#accent)"/>
  <text x="54" y="339" fill="{t["muted"]}" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="14">real GitHub contributions · updated daily</text>
</svg>'''


def dashboard_svg(
    metrics: list[tuple[str, int | str]],
    languages: list[tuple[str, int]],
    contributions: dict,
    dark: bool,
) -> str:
    t = theme(dark)
    bg = "#090C16" if dark else "#F6F4EA"
    panel = "#10162A" if dark else "#FFFDF4"
    text = "#F4F7FF" if dark else "#171A24"
    muted = "#8F9BB3" if dark else "#596273"
    line = "#2D385A" if dark else "#C8C2AF"
    purple = "#9B6CFF"
    cyan = "#4DD7FF"
    yellow = "#FFD166"
    green = "#6EE7A8"
    font = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"

    metric_map = {label: value for label, value in metrics}
    current_streak, longest_streak, active_days = streak_stats(contributions["days"])
    metric_items = [
        ("COMMITS", metric_map.get("Commits 30d", 0)),
        ("PULL REQS", metric_map.get("Pull Requests", 0)),
        ("ISSUES", metric_map.get("Issues", 0)),
        ("REPOS", metric_map.get("Repositories", 0)),
    ]
    metric_x = [54, 220, 386, 552]
    metric_blocks = []
    for idx, ((label, value), x) in enumerate(zip(metric_items, metric_x)):
        color = [purple, cyan, green, yellow][idx]
        metric_blocks.append(
            f'<text x="{x}" y="142" fill="{color}" font-family="{font}" font-size="30" font-weight="900">{html.escape(str(value))}</text>'
        )
        metric_blocks.append(
            f'<text x="{x}" y="163" fill="{muted}" font-family="{font}" font-size="11" font-weight="700">{label}</text>'
        )

    if not languages:
        languages = [("NO DATA", 1)]
    total = sum(size for _, size in languages)
    skill_rows = []
    skill_y = [254, 288, 322, 356]
    for idx, ((name, size), y) in enumerate(zip(languages[:4], skill_y)):
        pct = (size / total) * 100 if total else 0
        filled = max(1, min(10, round(pct / 10)))
        color = [purple, cyan, green, yellow][idx]
        skill_rows.append(
            f'<text x="54" y="{y + 10}" fill="{text}" font-family="{font}" font-size="13" font-weight="700">{html.escape(name.upper())}</text>'
        )
        for seg in range(10):
            x = 190 + seg * 24
            if seg < filled:
                skill_rows.append(
                    f'<rect x="{x}" y="{y}" width="16" height="12" fill="{color}">'
                    f'<animate attributeName="opacity" values=".5;1;.5" dur="{2.0 + seg * 0.08:.2f}s" begin="{seg * 0.04:.2f}s" repeatCount="indefinite"/>'
                    f'</rect>'
                )
            else:
                skill_rows.append(f'<rect x="{x}" y="{y}" width="16" height="12" fill="{line}"/>')
        skill_rows.append(
            f'<text x="472" y="{y + 10}" fill="{muted}" font-family="{font}" font-size="11">{pct:.1f}%</text>'
        )

    return f'''<svg width="720" height="410" viewBox="0 0 720 410" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
  <rect width="720" height="410" fill="{bg}"/>
  <rect x="18" y="18" width="684" height="374" fill="{panel}" stroke="{text}" stroke-width="4"/>
  <rect x="28" y="28" width="664" height="354" fill="none" stroke="{line}" stroke-width="2"/>

  <text x="48" y="58" fill="{yellow}" font-family="{font}" font-size="16" font-weight="900">PLAYER STATUS</text>
  <text x="526" y="58" fill="{green}" font-family="{font}" font-size="11">ONLINE</text>
  <rect x="650" y="46" width="10" height="10" fill="{green}">
    <animate attributeName="opacity" values="1;.15;1" dur="1s" repeatCount="indefinite"/>
  </rect>

  <g transform="translate(52 76)">
    <rect x="0" y="0" width="46" height="10" fill="{yellow}"/>
    <rect x="-6" y="10" width="58" height="38" fill="{text}"/>
    <rect x="4" y="20" width="8" height="8" fill="{bg}"/>
    <rect x="34" y="20" width="8" height="8" fill="{bg}"/>
    <rect x="8" y="48" width="38" height="34" fill="{purple}"/>
  </g>
  <text x="126" y="96" fill="{text}" font-family="{font}" font-size="20" font-weight="900">SMRI</text>
  <text x="126" y="118" fill="{muted}" font-family="{font}" font-size="11">CLASS: BUILDER</text>
  <text x="126" y="137" fill="{muted}" font-family="{font}" font-size="11">MODE : INDIE</text>

  {''.join(metric_blocks)}

  <rect x="48" y="188" width="624" height="2" fill="{line}"/>
  <text x="50" y="215" fill="{cyan}" font-family="{font}" font-size="12">STREAK {current_streak}D</text>
  <text x="188" y="215" fill="{purple}" font-family="{font}" font-size="12">BEST {longest_streak}D</text>
  <text x="308" y="215" fill="{green}" font-family="{font}" font-size="12">ACTIVE {active_days}</text>
  <text x="446" y="215" fill="{yellow}" font-family="{font}" font-size="12">XP {contributions["total"]}</text>

  <text x="50" y="240" fill="{muted}" font-family="{font}" font-size="11" font-weight="700">SKILL SLOTS</text>
  {''.join(skill_rows)}

  <text x="538" y="265" fill="{muted}" font-family="{font}" font-size="10">AUTO SAVE</text>
  <rect x="538" y="278" width="118" height="10" fill="{line}"/>
  <rect x="538" y="278" width="76" height="10" fill="{purple}">
    <animate attributeName="width" values="18;118;76;118" dur="5.2s" repeatCount="indefinite"/>
  </rect>
  <text x="538" y="320" fill="{text}" font-family="{font}" font-size="11">▶ CONTINUE</text>
  <rect x="646" y="309" width="8" height="14" fill="{cyan}">
    <animate attributeName="opacity" values="1;0;1" dur=".8s" repeatCount="indefinite"/>
  </rect>
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

    # Fetch all required data before writing any generated asset.
    repos = list_public_repos(owner, token)
    metrics = collect_stats(owner, repos, token)
    languages = collect_languages(owner, repos, token)
    contributions = collect_contributions(owner, token)

    generated = {
        OUT_DIR / "dashboard-dark.svg": dashboard_svg(metrics, languages, contributions, True),
        OUT_DIR / "dashboard-light.svg": dashboard_svg(metrics, languages, contributions, False),
    }

    changed = False
    for path, content in generated.items():
        changed = write_if_changed(path, content) or changed

    if not changed:
        print("Profile dashboard assets are already up to date.")
    else:
        print("Updated profile dashboard assets.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
