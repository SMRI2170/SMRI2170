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

def api_get(path, token):
    req=Request(f"{API_ROOT}{path}",headers={"Accept":"application/vnd.github+json","Authorization":f"Bearer {token}","User-Agent":"SMRI2170-profile-activity","X-GitHub-Api-Version":"2022-11-28"})
    with urlopen(req,timeout=25) as response: return json.load(response)

def graphql(query, variables, token):
    req=Request(GRAPHQL_URL,data=json.dumps({"query":query,"variables":variables}).encode(),headers={"Accept":"application/vnd.github+json","Authorization":f"Bearer {token}","Content-Type":"application/json","User-Agent":"SMRI2170-profile-activity"},method="POST")
    with urlopen(req,timeout=25) as response: result=json.load(response)
    if result.get("errors"): raise RuntimeError(result["errors"])
    return result["data"]

def contributions(owner,token):
    q="""query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{totalContributions weeks{firstDay contributionDays{date contributionCount}}}}}}"""
    cal=graphql(q,{"login":owner},token)["user"]["contributionsCollection"]["contributionCalendar"]
    return {"total":int(cal["totalContributions"]),"weeks":cal["weeks"],"days":[d for w in cal["weeks"] for d in w["contributionDays"]]}

def repos(owner,token):
    out=[]
    for page in range(1,6):
        items=api_get(f"/users/{quote(owner)}/repos?type=owner&sort=pushed&direction=desc&per_page=100&page={page}",token)
        if not items: break
        out.extend(items)
        if len(items)<100: break
    return [r for r in out if not r.get("fork") and not r.get("archived") and not r.get("private")]

def include_repo(r):
    n=r.get("name","")
    return n!=PROFILE_REPO and not any(n.startswith(p) for p in STATIC_PREFIXES)

def commits30(owner,rs,token):
    since=(datetime.now(timezone.utc)-timedelta(days=30)).isoformat().replace("+00:00","Z"); total=0
    for r in rs:
        if not include_repo(r): continue
        for page in range(1,4):
            items=api_get(f"/repos/{quote(owner)}/{quote(r['name'])}/commits?author={quote(owner)}&since={quote(since)}&per_page=100&page={page}",token)
            total+=len(items)
            if len(items)<100: break
    return total

def search_count(q,token):
    return int(api_get(f"/search/issues?q={quote(q)}&per_page=1",token).get("total_count",0))

def streak(days):
    counts={datetime.fromisoformat(d["date"]).date():int(d["contributionCount"]) for d in days}
    if not counts:return 0
    cur=max(counts)
    if counts.get(cur,0)==0: cur-=timedelta(days=1)
    s=0
    while counts.get(cur,0)>0:s+=1;cur-=timedelta(days=1)
    return s

def theme(dark):
    return {"bg":"#0A0F0B","text":"#E9E6DA","muted":"#929A91","line":"#283229","accent":"#718174","fill":"#111812"} if dark else {"bg":"#F0EDE3","text":"#182019","muted":"#697169","line":"#C4C9C0","accent":"#566B5A","fill":"#E3E5DE"}

def svg(owner,rs,c,commit_count,pr_count,dark):
    p=theme(dark); serif="Georgia,Times New Roman,serif"; sans="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"; mono="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"
    st=streak(c["days"])
    weeks=c["weeks"][-12:]; totals=[sum(int(d["contributionCount"]) for d in w["contributionDays"]) for w in weeks]; m=max(totals) if totals else 1
    pts=[]
    for i,v in enumerate(totals):
        x=78+i*(1040/11); y=240-(76*(v/m if m else 0))
        pts.append((x,y))
    line=" ".join(f"{x:.1f},{y:.1f}" for x,y in pts)
    area=f"68,252 {line} 1132,252"
    stats=[("COMMITS / 30D",commit_count),("PUBLIC REPOS",len(rs)),("PULL REQUESTS",pr_count),("STREAK",f"{st}D"),("CONTRIBUTIONS / YR",c["total"])]
    blocks=[]
    for i,(label,val) in enumerate(stats):
        x=68+i*213
        blocks.append(f'<text x="{x}" y="118" fill="{p["text"]}" font-family="{serif}" font-size="30" font-weight="700">{html.escape(str(val))}</text>')
        blocks.append(f'<text x="{x}" y="141" fill="{p["muted"]}" font-family="{mono}" font-size="9.5">{label}</text>')
        if i<4: blocks.append(f'<line x1="{x+177}" y1="94" x2="{x+177}" y2="146" stroke="{p["line"]}"/>')
    return f'''<svg width="1200" height="300" viewBox="0 0 1200 300" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="300" fill="{p["bg"]}"/><text x="68" y="48" fill="{p["accent"]}" font-family="{mono}" font-size="11" letter-spacing="2.2">03 / ACTIVITY</text><text x="1132" y="48" text-anchor="end" fill="{p["muted"]}" font-family="{sans}" font-size="13">12 week terrain · updated daily</text><line x1="68" y1="68" x2="1132" y2="68" stroke="{p["line"]}"/>{''.join(blocks)}<polygon points="{area}" fill="{p["fill"]}" opacity=".68"/><polyline points="{line}" fill="none" stroke="{p["accent"]}" stroke-width="2"/><line x1="68" y1="252" x2="1132" y2="252" stroke="{p["line"]}"/><text x="68" y="278" fill="{p["muted"]}" font-family="{mono}" font-size="9.5">LOW ACTIVITY</text><text x="1132" y="278" text-anchor="end" fill="{p["muted"]}" font-family="{mono}" font-size="9.5">RECENT 12 WEEKS</text></svg>'''

def write(path,content):
    if path.exists() and path.read_text(encoding="utf-8")==content:return False
    path.parent.mkdir(parents=True,exist_ok=True);path.write_text(content,encoding="utf-8");return True

def main():
    token=os.environ.get("GITHUB_TOKEN");owner=os.environ.get("PROFILE_OWNER")
    if not token or not owner:return 2
    rs=repos(owner,token);c=contributions(owner,token);cc=commits30(owner,rs,token);prs=search_count(f"author:{owner} type:pr",token)
    changed=False
    for path,content in {OUT_DIR/"activity-dark.svg":svg(owner,rs,c,cc,prs,True),OUT_DIR/"activity-light.svg":svg(owner,rs,c,cc,prs,False)}.items(): changed=write(path,content) or changed
    print("Updated activity." if changed else "Activity unchanged.");return 0
if __name__=="__main__": raise SystemExit(main())
