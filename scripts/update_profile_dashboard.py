from __future__ import annotations
import html, json, os, sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

API_ROOT="https://api.github.com"
GRAPHQL_URL="https://api.github.com/graphql"
OUT_DIR=Path("assets/profile/generated")
PROFILE_REPO="SMRI2170"
STATIC_PREFIXES=("Official-Website-of-",)
LEAF_PATH="M63.81 192.19c-47.89-79.81 16-159.62 151.64-151.64C223.43 176.23 143.62 240.08 63.81 192.19Z"
LEAF_LINE="M160 96 L40 216"

def api_get(path, token):
    req=Request(f"{API_ROOT}{path}",headers={"Accept":"application/vnd.github+json","Authorization":f"Bearer {token}","User-Agent":"SMRI2170-digital-garden","X-GitHub-Api-Version":"2022-11-28"})
    with urlopen(req,timeout=25) as response: return json.load(response)

def graphql(query, variables, token):
    req=Request(GRAPHQL_URL,data=json.dumps({"query":query,"variables":variables}).encode(),headers={"Accept":"application/vnd.github+json","Authorization":f"Bearer {token}","Content-Type":"application/json","User-Agent":"SMRI2170-digital-garden"},method="POST")
    with urlopen(req,timeout=25) as response: result=json.load(response)
    if result.get("errors"): raise RuntimeError(result["errors"])
    return result["data"]

def collect_contributions(owner,token):
    query="""query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{totalContributions weeks{firstDay contributionDays{date contributionCount weekday}}}}}}"""
    cal=graphql(query,{"login":owner},token)["user"]["contributionsCollection"]["contributionCalendar"]
    return {"total":int(cal["totalContributions"]),"weeks":cal["weeks"],"days":[d for w in cal["weeks"] for d in w["contributionDays"]]}

def streak_stats(days):
    counts={datetime.fromisoformat(d["date"]).date():int(d["contributionCount"]) for d in days}
    if not counts:return 0,0
    ordered=sorted(counts); cursor=ordered[-1]
    if counts.get(cursor,0)==0: cursor-=timedelta(days=1)
    current=0
    while counts.get(cursor,0)>0: current+=1; cursor-=timedelta(days=1)
    cutoff=ordered[-1]-timedelta(days=29)
    return current,sum(1 for d,v in counts.items() if d>=cutoff and v>0)

def list_public_repos(owner,token):
    repos=[]
    for page in range(1,6):
        items=api_get(f"/users/{quote(owner)}/repos?type=owner&sort=pushed&direction=desc&per_page=100&page={page}",token)
        if not items: break
        repos.extend(items)
        if len(items)<100: break
    return [r for r in repos if not r.get("fork") and not r.get("archived") and not r.get("private")]

def include_repo(repo):
    name=repo.get("name","")
    return name!=PROFILE_REPO and not any(name.startswith(p) for p in STATIC_PREFIXES)

def count_recent_commits(owner,repos,token):
    since=(datetime.now(timezone.utc)-timedelta(days=30)).isoformat().replace("+00:00","Z"); total=0
    for repo in repos:
        if not include_repo(repo): continue
        for page in range(1,4):
            commits=api_get(f"/repos/{quote(owner)}/{quote(repo['name'])}/commits?author={quote(owner)}&since={quote(since)}&per_page=100&page={page}",token)
            total+=len(commits)
            if len(commits)<100: break
    return total

def search_count(query,token):
    return int(api_get(f"/search/issues?q={quote(query)}&per_page=1",token).get("total_count",0))

def palette(dark):
    return {"bg":"#08110C","text":"#EEF4EB","muted":"#9CAF9A","border":"#294532","moss":"#6F936B","sage":"#9BB594","fern":"#4F7D5B","water":"#79AEB2","sun":"#D5B96C"} if dark else {"bg":"#F3F1E7","text":"#263329","muted":"#687667","border":"#C3CDBE","moss":"#597D5A","sage":"#789A76","fern":"#356348","water":"#5A969C","sun":"#B89347"}

def leaf(x,y,scale,color,opacity=1.0,rotate=0.0):
    return f'<g transform="translate({x} {y}) rotate({rotate}) scale({scale})" opacity="{opacity}" fill="none" stroke="{color}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><path d="{LEAF_PATH}"/><path d="{LEAF_LINE}"/></g>'

def growth_svg(owner,repos,contributions,commits30,prs,dark):
    p=palette(dark); font="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"; mono="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"
    current_streak,active30=streak_stats(contributions["days"])
    weeks=contributions["weeks"][-12:]; totals=[sum(int(d["contributionCount"]) for d in w["contributionDays"]) for w in weeks]; max_week=max(totals) if totals else 1
    plants=[]; base_y=298
    for idx,value in enumerate(totals):
        x=70+idx*48; ratio=(value/max_week) if max_week else 0; color=[p["fern"],p["moss"],p["sage"]][idx%3]
        if value<=0:
            plants.append(f'<ellipse cx="{x}" cy="{base_y}" rx="5" ry="3" fill="{p["border"]}"/>'); continue
        if ratio<0.30:
            top=base_y-(34+int(28*ratio))
            plants.append(f'<path d="M{x} {base_y} C{x-2} {base_y-18} {x+2} {top+10} {x} {top}" fill="none" stroke="{color}" stroke-width="3" stroke-linecap="round"/>')
            plants.append(leaf(x-16,top+9,.060,color,.82,-24))
        elif ratio<0.68:
            top=base_y-(58+int(52*ratio))
            plants.append(f'<path d="M{x} {base_y} C{x-4} {base_y-28} {x+4} {top+24} {x} {top}" fill="none" stroke="{color}" stroke-width="3" stroke-linecap="round"/>')
            plants.append(leaf(x-22,top+12,.078,color,.90,-24)); plants.append(leaf(x+5,top+31,.070,p["sage"],.76,24))
            plants.append(f'<circle cx="{x}" cy="{top}" r="3.2" fill="{p["sun"]}" opacity=".75"/>')
        else:
            top=base_y-(92+int(38*ratio))
            plants.append(f'<path d="M{x} {base_y} C{x-4} {base_y-34} {x+5} {top+28} {x} {top}" fill="none" stroke="{color}" stroke-width="3.2" stroke-linecap="round"/>')
            plants.append(leaf(x-24,top+18,.082,color,.92,-24)); plants.append(leaf(x+6,top+38,.075,p["sage"],.82,24))
            plants.append(f'<g transform="translate({x} {top})"><circle cx="0" cy="-8" r="5.2" fill="{p["sage"]}"/><circle cx="8" cy="0" r="5.2" fill="{p["moss"]}"/><circle cx="0" cy="8" r="5.2" fill="{p["sage"]}"/><circle cx="-8" cy="0" r="5.2" fill="{p["moss"]}"/><circle r="4" fill="{p["sun"]}"><animate attributeName="opacity" values=".55;1;.55" dur="{2.4+idx*.09:.2f}s" repeatCount="indefinite"/></circle></g>')
    stats=[("COMMITS 30D",commits30,p["moss"]),("REPOSITORIES",len(repos),p["fern"]),("PULL REQUESTS",prs,p["water"]),("STREAK",f"{current_streak}d",p["sage"]),("ACTIVE 30D",active30,p["sun"])]
    xs=[54,184,326,466,574]; blocks=[]
    for (label,value,color),x in zip(stats,xs):
        blocks.append(f'<text x="{x}" y="102" fill="{color}" font-family="{font}" font-size="25" font-weight="800">{html.escape(str(value))}</text><text x="{x}" y="122" fill="{p["muted"]}" font-family="{mono}" font-size="9.5" font-weight="700">{label}</text>')
    return f'''<svg width="720" height="350" viewBox="0 0 720 350" xmlns="http://www.w3.org/2000/svg"><rect width="720" height="350" rx="26" fill="{p["bg"]}"/><rect x="1" y="1" width="718" height="348" rx="25" fill="none" stroke="{p["border"]}" stroke-width="2"/>{leaf(22,9,.12,p["moss"],.9,-12)}<text x="64" y="45" fill="{p["text"]}" font-family="{font}" font-size="18" font-weight="800">Growth</text><text x="125" y="45" fill="{p["muted"]}" font-family="{font}" font-size="13">GitHub activity · updated daily</text>{''.join(blocks)}<line x1="54" y1="145" x2="666" y2="145" stroke="{p["border"]}"/><text x="54" y="171" fill="{p["muted"]}" font-family="{mono}" font-size="10" font-weight="700">LAST 12 WEEKS · {contributions["total"]} CONTRIBUTIONS / YEAR</text>{''.join(plants)}<path d="M52 302 C165 294 268 310 374 300 C470 291 565 305 668 298" fill="none" stroke="{p["border"]}" stroke-width="2"/><text x="54" y="329" fill="{p["muted"]}" font-family="{mono}" font-size="9">SEED · SPROUT · LEAF · BLOOM / ACTIVITY INTENSITY</text></svg>'''

def write_if_changed(path,content):
    if path.exists() and path.read_text(encoding="utf-8")==content:return False
    path.parent.mkdir(parents=True,exist_ok=True); path.write_text(content,encoding="utf-8"); return True

def main():
    token=os.environ.get("GITHUB_TOKEN"); owner=os.environ.get("PROFILE_OWNER")
    if not token or not owner: print("GITHUB_TOKEN and PROFILE_OWNER are required",file=sys.stderr); return 2
    repos=list_public_repos(owner,token); contributions=collect_contributions(owner,token); commits30=count_recent_commits(owner,repos,token); prs=search_count(f"author:{owner} type:pr",token)
    generated={OUT_DIR/"growth-dark.svg":growth_svg(owner,repos,contributions,commits30,prs,True),OUT_DIR/"growth-light.svg":growth_svg(owner,repos,contributions,commits30,prs,False)}
    changed=False
    for path,content in generated.items(): changed=write_if_changed(path,content) or changed
    print("Updated profile growth assets." if changed else "Profile growth assets are already up to date."); return 0
if __name__=="__main__": raise SystemExit(main())
