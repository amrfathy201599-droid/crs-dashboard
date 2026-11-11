"""
Watches Database.xlsx; when you SAVE it, publishes the numbers to GitHub (data.json)
so the dashboard (GitHub Pages) updates by itself.  Free. Needs: pip install openpyxl
"""
import os, sys, time, json, base64, shutil, tempfile, hashlib, datetime, urllib.request, urllib.error
from openpyxl import load_workbook

# ================== EDIT THESE ==================
EXCEL_PATH = r"F:\DATABASE POWER BI\Database.xlsx"
GITHUB_REPO = "amrfathy201599-droid/crs-dashboard"      # owner/repo
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "PASTE_TOKEN_HERE")
CHECK_EVERY_SEC = 20
# =================================================

SHEETS = ["Europe", "Africa", "Latin Amercain", "Local", "Orders"]
BRANCH = "main"

def build():
    tmp = os.path.join(tempfile.gettempdir(), "crs_copy.xlsx")
    shutil.copy2(EXCEL_PATH, tmp)                      # copy so an open Excel doesn't block us
    wb = load_workbook(tmp, read_only=True, data_only=True)
    out = {}
    for s in SHEETS:
        it = wb[s].iter_rows(values_only=True)
        heads = [("" if h is None else str(h)) for h in next(it)]
        rows = []
        for r in it:
            if r[0] is None or r[1] is None: continue
            d = r[1]
            if isinstance(d, datetime.datetime): d = (d - datetime.datetime(1899, 12, 30)).days
            vals = [x if isinstance(x, (int, float)) and not isinstance(x, bool) else 0 for x in r[2:]]
            if not any(vals): continue                 # skip empty rows -> small file
            rows.append([str(r[0]).strip(), d] + vals)
        out[s] = {"heads": heads, "rows": rows}
    wb.close()
    return {"updated": datetime.datetime.utcnow().isoformat() + "Z", "sheets": out}

def api(method, url, body=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body else None,
        headers={"Authorization": "Bearer " + GITHUB_TOKEN, "Accept": "application/vnd.github+json",
                 "User-Agent": "crs-sync", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())

def publish(payload):
    url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/data.json"
    sha = None
    try: sha = api("GET", url + f"?ref={BRANCH}")["sha"]
    except urllib.error.HTTPError as e:
        if e.code != 404: raise
    body = {"message": "data update " + payload["updated"], "branch": BRANCH,
            "content": base64.b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode()}
    if sha: body["sha"] = sha
    api("PUT", url, body)

def main():
    if "--dry" in sys.argv:
        p = build(); open("data.json", "w").write(json.dumps(p, separators=(",", ":")))
        print("data.json written,", os.path.getsize("data.json") // 1024, "KB"); return
    last_m, last_h = 0, ""
    print("Watching", EXCEL_PATH, "- press Ctrl+C to stop")
    while True:
        try:
            m = os.path.getmtime(EXCEL_PATH)
            if m != last_m:
                p = build(); h = hashlib.md5(json.dumps(p["sheets"], sort_keys=True).encode()).hexdigest()
                if h != last_h:
                    publish(p); last_h = h
                    print(time.strftime("%H:%M:%S"), "published ✔")
                last_m = m
        except Exception as e:
            print(time.strftime("%H:%M:%S"), "error:", e)
        time.sleep(CHECK_EVERY_SEC)

main()
