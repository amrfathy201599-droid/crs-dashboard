"""
sync_to_dashboard.py
يقرأ Database.xlsx -> يعمل data.json -> يرفعه على GitHub (فيتحدّث الـ Dashboard عند المدير).

التشغيل:
  python sync_to_dashboard.py          # مرة واحدة
  python sync_to_dashboard.py --watch  # يفضل شغال ويرفع أول ما تحفظ الإكسل
"""
import json, os, shutil, subprocess, sys, tempfile, time, datetime as dt

# ===================== الإعدادات =====================
EXCEL_PATH = r"Database.xlsx"      # مسار ملف الإكسل (ممكن مسار كامل مثلاً C:\Users\You\Desktop\Database.xlsx)
SHEETS = ["Europe", "Africa", "Latin Amercain", "Local", "Orders"]   # لازم نفس أسماء الـ Dashboard
WATCH_EVERY = 5                    # ثانية: كل قد إيه يشيك على تغيير الملف في وضع --watch
# =====================================================

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data.json")

def clean(v):
    if isinstance(v, dt.datetime): return v.date().isoformat()
    if isinstance(v, dt.date):     return v.isoformat()
    if isinstance(v, bool):        return None
    if isinstance(v, (int, float)): return v
    if isinstance(v, str):
        s = v.strip()
        return s if s and s.lower() != "null" else None
    return None

def build():
    import openpyxl
    src = EXCEL_PATH if os.path.isabs(EXCEL_PATH) else os.path.join(HERE, EXCEL_PATH)
    # ننسخ الملف الأول عشان ميبقاش مقفول لو الإكسل مفتوح
    tmp = os.path.join(tempfile.gettempdir(), "_crs_copy.xlsx")
    shutil.copy2(src, tmp)
    wb = openpyxl.load_workbook(tmp, data_only=True, read_only=True)
    sheets = {}
    for name in SHEETS:
        if name not in wb.sheetnames:
            print(f"  ! الشيت '{name}' مش موجود في الملف - هيتحط فاضي")
            sheets[name] = {"heads": ["Name", "Date"], "rows": []}
            continue
        it = wb[name].iter_rows(values_only=True)
        heads = [str(h) if h is not None else "" for h in next(it)]
        while heads and heads[-1] == "":   # نشيل الأعمدة الفاضية في الآخر
            heads.pop()
        n = len(heads); rows = []
        for r in it:
            nm, d = r[0], r[1] if len(r) > 1 else None
            if nm is None or d is None: continue
            row = [clean(x) for x in (list(r) + [None] * n)[:n]]
            row[0] = str(nm).strip()
            if not row[0]: continue
            while len(row) > 2 and row[-1] is None: row.pop()   # نصغّر الحجم
            rows.append(row)
        sheets[name] = {"heads": heads, "rows": rows}
        print(f"  {name}: {len(rows)} صف")
    wb.close()
    return sheets

def sh(*cmd):
    return subprocess.run(cmd, cwd=HERE, capture_output=True, text=True)

def run_once():
    print(time.strftime("[%H:%M:%S]"), "قراءة الإكسل...")
    sheets = build()
    body = json.dumps(sheets, ensure_ascii=False, separators=(",", ":"))
    if os.path.exists(OUT):
        try:
            old = json.load(open(OUT, encoding="utf-8"))
            if json.dumps(old["sheets"], ensure_ascii=False, separators=(",", ":")) == body:
                print("  مفيش تغيير في البيانات."); return
        except Exception: pass
    with open(OUT, "w", encoding="utf-8") as f:
        f.write('{"updated":%d,"sheets":%s}' % (int(time.time() * 1000), body))
    print("  تم تحديث data.json")
    if not os.path.isdir(os.path.join(HERE, ".git")):
        print("  (مفيش Git هنا - ارفع data.json يدوي أو اعمل git init)"); return
    sh("git", "add", "data.json")
    c = sh("git", "commit", "-m", "update data " + time.strftime("%Y-%m-%d %H:%M"))
    if "nothing to commit" in (c.stdout + c.stderr): return
    p = sh("git", "push")
    print("  ✅ اترفع على GitHub" if p.returncode == 0 else "  ❌ فشل الرفع:\n" + p.stderr)

if __name__ == "__main__":
    if "--watch" in sys.argv:
        src = EXCEL_PATH if os.path.isabs(EXCEL_PATH) else os.path.join(HERE, EXCEL_PATH)
        last = None
        print("وضع المراقبة شغال - سيبه مفتوح. (Ctrl+C للإيقاف)")
        while True:
            try:
                m = os.path.getmtime(src)
                if m != last:
                    last = m; run_once()
            except Exception as e:
                print("خطأ:", e)
            time.sleep(WATCH_EVERY)
    else:
        run_once()
