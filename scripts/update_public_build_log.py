from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

API_ROOT = "https://api.github.com"
README_PATH = Path("README.md")
START_MARKER = "<!-- activity:start -->"
END_MARKER = "<!-- activity:end -->"
WINDOW_DAYS = 7
MAX_REPOSITORIES = 3


def api_get(path: str, token: str):
    request = Request(
        f"{API_ROOT}{path}",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "SMRI2170-profile-build-log",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urlopen(request, timeout=20) as response:
        return json.load(response)


def parse_github_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def is_bot(commit: dict) -> bool:
    for key in ("author", "committer"):
        login = (commit.get(key) or {}).get("login", "")
        if login.endswith("[bot]"):
            return True
    return False


def clean_subject(message: str) -> str:
    subject = message.splitlines()[0].strip()
    subject = subject.replace("`", "'")
    return re.sub(r"\s+", " ", subject)[:120]


def format_date(value: str) -> str:
    # JST has no daylight-saving time, so a fixed UTC+9 conversion is enough.
    dt = parse_github_time(value).astimezone(timezone(timedelta(hours=9)))
    return f"{dt.strftime('%b')} {dt.day}"


def list_recent_public_repositories(owner: str, token: str, cutoff: datetime) -> list[dict]:
    recent = []
    for page in range(1, 4):
        repos = api_get(
            f"/users/{quote(owner)}/repos?type=owner&sort=pushed&direction=desc&per_page=100&page={page}",
            token,
        )
        if not repos:
            break

        for repo in repos:
            pushed_at = repo.get("pushed_at")
            if not pushed_at:
                continue

            pushed = parse_github_time(pushed_at)
            if pushed < cutoff:
                return recent

            if repo.get("private") or repo.get("archived") or repo.get("fork"):
                continue

            recent.append(repo)

        if len(repos) < 100:
            break

    return recent


def latest_human_commit(owner: str, repo: dict, token: str, cutoff: datetime) -> dict | None:
    default_branch = repo.get("default_branch") or "main"
    since = cutoff.isoformat().replace("+00:00", "Z")
    commits = api_get(
        f"/repos/{quote(owner)}/{quote(repo['name'])}/commits"
        f"?sha={quote(default_branch)}&since={quote(since)}&per_page=20",
        token,
    )

    for commit in commits:
        if is_bot(commit):
            continue

        details = commit.get("commit") or {}
        committer = details.get("committer") or {}
        author = details.get("author") or {}
        date = committer.get("date") or author.get("date")
        message = details.get("message") or ""

        if not date or not message:
            continue

        return {
            "repo": repo["name"],
            "date": date,
            "subject": clean_subject(message),
        }

    return None


def build_activity(owner: str, current_repo: str, token: str, now: datetime) -> str:
    cutoff = now - timedelta(days=WINDOW_DAYS)
    repos = list_recent_public_repositories(owner, token, cutoff)
    entries = []

    for repo in repos:
        full_name = repo.get("full_name", "")
        if full_name.lower() == current_repo.lower():
            continue

        commit = latest_human_commit(owner, repo, token, cutoff)
        if commit:
            entries.append(commit)

    entries.sort(key=lambda item: parse_github_time(item["date"]), reverse=True)
    entries = entries[:MAX_REPOSITORIES]

    if not entries:
        return "No public repository updates in the last 7 days."

    return "\n".join(
        f"- [`{item['repo']}`](https://github.com/{owner}/{item['repo']}) · "
        f"`{format_date(item['date'])}` — `{item['subject']}`"
        for item in entries
    )


def replace_activity(readme: str, activity: str) -> str:
    if readme.count(START_MARKER) != 1 or readme.count(END_MARKER) != 1:
        raise RuntimeError("README activity markers must each appear exactly once")

    start = readme.index(START_MARKER)
    end = readme.index(END_MARKER)

    if start >= end:
        raise RuntimeError("README activity markers are in the wrong order")

    before = readme[: start + len(START_MARKER)]
    after = readme[end:]
    return f"{before}\n{activity}\n{after}"


def main() -> int:
    token = os.environ.get("GITHUB_TOKEN")
    owner = os.environ.get("PROFILE_OWNER")
    current_repo = os.environ.get("PROFILE_REPOSITORY")

    if not token or not owner or not current_repo:
        print("GITHUB_TOKEN, PROFILE_OWNER, and PROFILE_REPOSITORY are required", file=sys.stderr)
        return 2

    original = README_PATH.read_text(encoding="utf-8")
    now = datetime.now(timezone.utc)

    # Fetch everything before touching README. API failures leave the existing
    # profile untouched because the write happens only after all calls succeed.
    activity = build_activity(owner, current_repo, token, now)
    updated = replace_activity(original, activity)

    if updated == original:
        print("Public Build Log is already up to date.")
        return 0

    README_PATH.write_text(updated, encoding="utf-8")
    print("Updated Public Build Log.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
