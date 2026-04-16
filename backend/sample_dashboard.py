"""
sample_dashboard.py — creates a "Sample Dashboard" on the demo user
with every chart type populated by hand-crafted dummy data chosen to
showcase each visualization's strengths.

Unlike smoke_test_new_charts.py (which uses BigQuery live queries),
this script generates data locally and POSTs it directly as tile
payloads. No quota consumption, deterministic output, fully isolated
from data source state.

Run from backend/: python sample_dashboard.py
"""
import sys
import json
import math
import random
import urllib.request
import urllib.error
from datetime import date, timedelta

API = "http://localhost:8002/api/v1"
TOKEN = None


def _req(path, method="GET", body=None):
    url = f"{API}{path}"
    headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return {"_error": e.code, "_body": e.read().decode()[:300]}


def login():
    global TOKEN
    req = urllib.request.Request(
        f"{API}/auth/demo-login",
        data=b"{}",
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        TOKEN = data["access_token"]


# ─── Dummy data generators ─────────────────────────────────────────
# Each returns (columns, rows). Seeded RNGs so re-runs produce the
# same data — useful if the user wants to regenerate tiles with
# identical shapes after a fix.

def gen_bar():
    rows = [
        {"category": "Electronics", "revenue": 2_450_000},
        {"category": "Fashion",     "revenue": 1_820_000},
        {"category": "Home Goods",  "revenue": 1_650_000},
        {"category": "Sports",      "revenue":   920_000},
        {"category": "Books",       "revenue":   410_000},
        {"category": "Toys",        "revenue":   380_000},
    ]
    return ["category", "revenue"], rows


def gen_bar_h():
    rows = [
        {"country": "United States",  "users": 4_820_000},
        {"country": "United Kingdom", "users": 1_940_000},
        {"country": "Germany",        "users": 1_720_000},
        {"country": "France",         "users": 1_380_000},
        {"country": "Japan",          "users": 1_210_000},
        {"country": "Australia",      "users":   980_000},
        {"country": "Canada",         "users":   870_000},
        {"country": "Brazil",         "users":   720_000},
        {"country": "Netherlands",    "users":   640_000},
        {"country": "Sweden",         "users":   520_000},
    ]
    return ["country", "users"], rows


def gen_line():
    rng = random.Random(42)
    rows = []
    base = 12_500
    for i in range(90):
        dow = i % 7
        trend = base * (1 + i * 0.012)
        seasonal = 0.82 if dow in (5, 6) else 1.0
        noise = 1 + (rng.random() - 0.5) * 0.08
        d = (date(2025, 1, 1) + timedelta(days=i)).isoformat()
        rows.append({"date": d, "users": int(trend * seasonal * noise)})
    return ["date", "users"], rows


def gen_area():
    rng = random.Random(7)
    rows = []
    for i in range(30):
        d = (date(2025, 3, 1) + timedelta(days=i)).isoformat()
        rows.append({
            "date": d,
            "organic":  int(8000 + i * 50 + rng.gauss(0, 500)),
            "paid":     int(4500 + i * 80 + rng.gauss(0, 400)),
            "referral": int(2000 + i * 20 + rng.gauss(0, 200)),
        })
    return ["date", "organic", "paid", "referral"], rows


def gen_pie():
    rows = [
        {"vendor": "AWS",     "share": 34},
        {"vendor": "Azure",   "share": 23},
        {"vendor": "GCP",     "share": 11},
        {"vendor": "Alibaba", "share":  6},
        {"vendor": "Others",  "share": 26},
    ]
    return ["vendor", "share"], rows


def gen_donut():
    rows = [
        {"os": "Android", "devices": 71},
        {"os": "iOS",     "devices": 26},
        {"os": "Windows", "devices":  2},
        {"os": "Other",   "devices":  1},
    ]
    return ["os", "devices"], rows


def gen_radar():
    rows = [
        {"skill": "Frontend",  "proficiency": 92},
        {"skill": "Backend",   "proficiency": 78},
        {"skill": "Database",  "proficiency": 85},
        {"skill": "DevOps",    "proficiency": 65},
        {"skill": "Design",    "proficiency": 88},
        {"skill": "Security",  "proficiency": 71},
        {"skill": "Testing",   "proficiency": 82},
    ]
    return ["skill", "proficiency"], rows


def gen_treemap():
    rows = [
        {"asset": "Tech Stocks",      "value": 45_000},
        {"asset": "Bonds",            "value": 22_000},
        {"asset": "Real Estate",      "value": 18_000},
        {"asset": "Emerging Markets", "value": 12_000},
        {"asset": "Crypto",           "value":  8_000},
        {"asset": "Cash",             "value":  7_000},
        {"asset": "Commodities",      "value":  5_000},
    ]
    return ["asset", "value"], rows


def gen_scatter():
    rng = random.Random(11)
    rows = []
    for _ in range(80):
        price = rng.uniform(10, 500)
        rating = min(5, max(1, 3 + (price / 500) * 1.5 + rng.gauss(0, 0.4)))
        sales = int(rng.uniform(50, 2000) * (6 - rating))
        rows.append({
            "price": round(price, 2),
            "rating": round(rating, 1),
            "sales": sales,
        })
    return ["price", "rating", "sales"], rows


def gen_stacked():
    rows = []
    quarters = ["Q1 23", "Q2 23", "Q3 23", "Q4 23", "Q1 24", "Q2 24", "Q3 24", "Q4 24"]
    for i, q in enumerate(quarters):
        rows.append({
            "quarter":     q,
            "direct":      round(1.2 + i * 0.15, 2),
            "partner":     round(0.8 + i * 0.10, 2),
            "marketplace": round(0.4 + i * 0.22, 2),
        })
    return ["quarter", "direct", "partner", "marketplace"], rows


def gen_kpi():
    rng = random.Random(13)
    rows = []
    mrr = 120_000
    for i in range(12):
        m = date(2024, 1, 1) + timedelta(days=i * 30)
        mrr = int(mrr * (1 + 0.085 + rng.random() * 0.02))
        rows.append({"month": m.strftime("%Y-%m"), "mrr": mrr})
    return ["month", "mrr"], rows


def gen_sparkline_kpi():
    rng = random.Random(31)
    rows = []
    base = 45_000
    for i in range(30):
        d = (date(2025, 3, 1) + timedelta(days=i)).isoformat()
        val = int(base * (1 + i * 0.02 + (rng.random() - 0.5) * 0.1))
        rows.append({"date": d, "views": val})
    return ["date", "views"], rows


def gen_scorecard():
    rng = random.Random(37)
    products = [
        "Atlas Pro Laptop", "Horizon Phone X", "Nova Wireless Buds", "Eclipse Watch",
        "Zenith 4K Monitor", "Vortex Gaming Mouse", "Aurora Keyboard", "Prism Speaker",
        "Comet USB Hub", "Nebula Desk Lamp", "Cosmos VR Headset", "Quantum SSD 2TB",
        "Meridian Camera", "Pulse Smart Ring", "Orion Drone", "Apollo Tablet",
    ]
    sales = sorted([rng.uniform(500, 5000) for _ in products], reverse=True)
    rows = [{"product": p, "units_sold": int(s * 100)} for p, s in zip(products, sales)]
    return ["product", "units_sold"], rows


def gen_hbar_card():
    rows = [
        {"region": "North America",     "revenue": 12_400_000},
        {"region": "Europe (West)",     "revenue":  8_900_000},
        {"region": "Asia Pacific",      "revenue":  7_200_000},
        {"region": "Latin America",     "revenue":  3_800_000},
        {"region": "Europe (East)",     "revenue":  2_600_000},
        {"region": "Middle East",       "revenue":  1_900_000},
        {"region": "Sub-Saharan Africa", "revenue": 1_200_000},
        {"region": "Oceania",           "revenue":    820_000},
    ]
    return ["region", "revenue"], rows


def gen_heat_matrix():
    rng = random.Random(29)
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    rows = []
    for day in days:
        for hour in range(24):
            is_weekend = day in ("Sat", "Sun")
            peak1 = 12 if is_weekend else 9
            peak2 = 20
            strength = (
                math.exp(-((hour - peak1) ** 2) / 8)
                + math.exp(-((hour - peak2) ** 2) / 12)
            )
            base = 0.2
            noise = rng.random() * 0.15
            traffic = int((base + strength * 0.8 + noise) * 10_000)
            rows.append({"day": day, "hour": hour, "traffic": traffic})
    return ["day", "hour", "traffic"], rows


def gen_scatter_3d():
    rng = random.Random(17)
    cats = ["Premium", "Standard", "Budget", "Luxury"]
    rows = []
    for _ in range(300):
        price = rng.uniform(10, 1000)
        quality = min(1.0, max(0.3, 0.4 + price / 2500 + rng.gauss(0, 0.08)))
        popularity = rng.uniform(100, 8_000) * (1.4 - quality)
        rows.append({
            "price": round(price, 2),
            "quality": round(quality, 3),
            "popularity": round(popularity, 0),
            "category": rng.choice(cats),
        })
    return ["price", "quality", "popularity", "category"], rows


def gen_hologram():
    rng = random.Random(19)
    cats = ["Premium", "Standard", "Budget"]
    rows = []
    for _ in range(500):
        day = date(2024, 1, 1) + timedelta(days=rng.randint(0, 365))
        price = rng.uniform(10, 1000)
        quality = rng.uniform(0.4, 1.0)
        popularity = rng.uniform(100, 8_000)
        rows.append({
            "price": round(price, 2),
            "quality": round(quality, 3),
            "popularity": round(popularity, 0),
            "trip_day": day.isoformat(),
            "category": rng.choice(cats),
        })
    return ["price", "quality", "popularity", "trip_day", "category"], rows


def gen_globe():
    # 20 globally distributed cities — ensures the globe chart shows
    # readable points across every continent, not clustered in NYC
    # like the smoke-test BigQuery data did.
    cities = [
        ("New York",      40.7128,  -74.0060, 12_500),
        ("London",        51.5074,   -0.1278,  9_800),
        ("Tokyo",         35.6762,  139.6503, 14_200),
        ("Sydney",       -33.8688,  151.2093,  4_100),
        ("Sao Paulo",    -23.5505,  -46.6333,  7_300),
        ("Mumbai",        19.0760,   72.8777,  8_600),
        ("Cape Town",    -33.9249,   18.4241,  1_800),
        ("Cairo",         30.0444,   31.2357,  3_200),
        ("Los Angeles",   34.0522, -118.2437,  6_400),
        ("Singapore",      1.3521,  103.8198,  5_700),
        ("Paris",         48.8566,    2.3522,  5_900),
        ("Berlin",        52.5200,   13.4050,  4_800),
        ("Toronto",       43.6532,  -79.3832,  3_400),
        ("Dubai",         25.2048,   55.2708,  4_600),
        ("Istanbul",      41.0082,   28.9784,  3_900),
        ("Bangkok",       13.7563,  100.5018,  4_300),
        ("Mexico City",   19.4326,  -99.1332,  5_200),
        ("Buenos Aires", -34.6037,  -58.3816,  2_800),
        ("Moscow",        55.7558,   37.6173,  4_100),
        ("Beijing",       39.9042,  116.4074,  7_800),
    ]
    rows = [
        {"lat": lat, "lng": lng, "users": u, "city": name}
        for name, lat, lng, u in cities
    ]
    return ["lat", "lng", "users", "city"], rows


def gen_ridgeline():
    rng = random.Random(23)
    services = [
        ("API Gateway",    50,  30),
        ("Auth Service",   120, 40),
        ("Database Read",  80,  50),
        ("Database Write", 180, 70),
        ("Cache Layer",    15,  8),
        ("ML Inference",   320, 120),
    ]
    rows = []
    for service, mean, stddev in services:
        for _ in range(150):
            v = max(1, rng.gauss(mean, stddev))
            rows.append({"service": service, "response_ms": round(v, 1)})
    return ["service", "response_ms"], rows


def gen_particle_flow():
    # Clean curl vector field centered on (0, 0) — whirlpool pattern
    # with 4 numeric columns so the engine uses real data (not synthetic
    # fallback). Produces a visibly rotating flow in the tile.
    rows = []
    for gx in range(-6, 7):
        for gy in range(-6, 7):
            x = gx * 0.25
            y = gy * 0.25
            r = math.sqrt(x * x + y * y) + 0.001
            vx = -y / r * 0.5
            vy = x / r * 0.5
            rows.append({
                "x":  round(x, 3),
                "y":  round(y, 3),
                "vx": round(vx, 4),
                "vy": round(vy, 4),
            })
    return ["x", "y", "vx", "vy"], rows


def gen_liquid_gauge():
    rows = [{"metric": "Q4 Goal Progress", "pct": 78}]
    return ["metric", "pct"], rows


# ─── Chart definitions + layout ────────────────────────────────────

SECTIONS = [
    ("Core Charts", [
        ("bar",          "Monthly Revenue by Category",  gen_bar),
        ("bar_h",        "Active Users by Country",      gen_bar_h),
        ("line",         "Daily Active Users (90 days)", gen_line),
        ("area",         "Traffic Sources (30 days)",    gen_area),
        ("pie",          "Cloud Market Share",           gen_pie),
        ("donut",        "Device OS Distribution",       gen_donut),
    ]),
    ("Advanced Standard", [
        ("radar",        "Skills Assessment",            gen_radar),
        ("treemap",      "Portfolio Allocation",         gen_treemap),
        ("scatter",      "Price vs Rating Correlation",  gen_scatter),
        ("stacked_bar",  "Revenue by Channel (Quarterly)", gen_stacked),
        ("kpi",          "Monthly Recurring Revenue",    gen_kpi),
    ]),
    ("Dense Family · Tableau-class", [
        ("sparkline_kpi",    "Daily Page Views",         gen_sparkline_kpi),
        ("scorecard_table",  "Top Products by Sales",    gen_scorecard),
        ("hbar_card",        "Revenue by Region",        gen_hbar_card),
        ("heat_matrix",      "Day × Hour Traffic",       gen_heat_matrix),
    ]),
    ("Wow Factor · 3D + Geo + Premium", [
        ("scatter_3d",       "3D Product Space",          gen_scatter_3d),
        ("hologram_scatter", "Hologram: Products over Time", gen_hologram),
        ("geo_map",          "Global User Distribution (20 cities)", gen_globe),
        ("ridgeline",        "Service Response Time Distributions", gen_ridgeline),
        ("particle_flow",    "Curl Vector Field",         gen_particle_flow),
        ("liquid_gauge",     "Q4 Goal Progress",          gen_liquid_gauge),
    ]),
]

# SP-3: Rich content tiles (not chart-based — custom payloads)
RICH_CONTENT_TILES = [
    ("Rich Content · SP-3", [
        {
            "title": "Executive Summary",
            "chartType": "text",
            "content": (
                "# Q4 Performance Review\n\n"
                "Revenue exceeded targets by **24.7%**, driven primarily by "
                "the West region which contributed 52% of new bookings.\n\n"
                "## Key Highlights\n\n"
                "- Churn dropped **0.4 points** — the lowest in six quarters\n"
                "- NPS improved from 42 to **51** (+9 points)\n"
                "- Average deal size increased to **$47.2K** (up from $38.1K)\n\n"
                "---\n\n"
                "*Updated by the analytics team on April 16, 2026.*"
            ),
        },
        {
            "title": "Revenue Insight",
            "chartType": "insight",
            "insightText": (
                "Revenue is up $478K (24.7%) driven primarily by the West region, "
                "which contributed 52% of new bookings. Churn dropped 0.4 points — "
                "the lowest level in six quarters. Average deal velocity improved by "
                "3.2 days, suggesting the new qualification framework is taking effect."
            ),
            "insightGeneratedAt": "2026-04-16T10:30:00Z",
            "linkedTileIds": [],
        },
        {
            "title": "Recent Activity",
            "chartType": "activity",
            "events": [
                {"type": "won", "person": "Sarah K.", "action": "closed", "entity": "Acme Renewal", "timestamp": "2026-04-16T10:15:00Z"},
                {"type": "moved", "person": "Marcus T.", "action": "moved to Negotiation", "entity": "Globex Corp", "timestamp": "2026-04-16T09:42:00Z"},
                {"type": "created", "person": "Alex R.", "action": "created opportunity", "entity": "Nova Industries", "timestamp": "2026-04-16T09:20:00Z"},
                {"type": "note", "person": "Jamie L.", "action": "added note on", "entity": "Q4 Pipeline", "detail": "Flagged 3 deals at risk of slipping to Q1", "timestamp": "2026-04-16T08:55:00Z"},
                {"type": "lost", "person": "Taylor M.", "action": "lost deal", "entity": "Orion Systems", "detail": "Lost to competitor pricing", "timestamp": "2026-04-16T08:30:00Z"},
                {"type": "won", "person": "Jordan P.", "action": "closed", "entity": "Stellar Analytics", "timestamp": "2026-04-15T17:45:00Z"},
                {"type": "refresh", "person": "System", "action": "auto-refreshed", "entity": "Revenue Dashboard", "timestamp": "2026-04-15T17:00:00Z"},
                {"type": "alert", "person": "System", "action": "alert triggered:", "entity": "Churn rate above 5%", "timestamp": "2026-04-15T16:20:00Z"},
            ],
        },
    ]),
]


def run():
    login()
    print("[login] token ok")

    # Delete any existing "Sample Dashboard" so re-runs are idempotent
    # (otherwise the user ends up with a growing pile of duplicates).
    existing = _req("/dashboards/")
    for d in existing.get("dashboards", []):
        if d.get("name") == "Sample Dashboard":
            _req(f"/dashboards/{d['id']}", "DELETE")
            print(f"[cleanup] removed old Sample Dashboard {d['id']}")

    # Create a fresh dashboard
    dash = _req("/dashboards/", "POST", {"name": "Sample Dashboard"})
    if dash.get("_error"):
        print(f"FATAL: dashboard create failed {dash['_error']}: {dash.get('_body')}")
        return
    dash_id = dash["id"]
    print(f"[dashboard] created {dash_id}: {dash['name']}")

    # Use the default tab that ships with every new dashboard
    default_tab_id = dash["tabs"][0]["id"]
    print(f"[tab] using default: {default_tab_id}")

    results = []
    for section_name, charts in SECTIONS:
        sec_resp = _req(
            f"/dashboards/{dash_id}/tabs/{default_tab_id}/sections",
            "POST",
            {"name": section_name},
        )
        if sec_resp.get("_error"):
            print(f"FATAL: section create failed for {section_name}: {sec_resp.get('_body')}")
            return
        # Pull the newly-created section id from the returned dashboard
        tab_after = [t for t in sec_resp["tabs"] if t["id"] == default_tab_id][0]
        section_id = tab_after["sections"][-1]["id"]
        print(f"\n[section] {section_name} ({section_id})")

        for chart_type, title, gen in charts:
            cols, rows = gen()
            tile_body = {
                "title": title,
                "chartType": chart_type,
                "columns": cols,
                "rows": rows,
            }
            tile_resp = _req(
                f"/dashboards/{dash_id}/tabs/{default_tab_id}/sections/{section_id}/tiles",
                "POST",
                tile_body,
            )
            if tile_resp.get("_error"):
                print(f"  FAIL {chart_type:20s} {title[:40]:40s} — {tile_resp.get('_body')[:120]}")
                results.append({"chart": chart_type, "status": "fail"})
            else:
                print(f"  PASS {chart_type:20s} {title[:40]:40s} rows={len(rows):4d} cols={len(cols)}")
                results.append({"chart": chart_type, "status": "pass", "rows": len(rows), "cols": len(cols)})

    # SP-3: Rich content tiles (text, insight, activity)
    for section_name, tiles in RICH_CONTENT_TILES:
        sec_resp = _req(
            f"/dashboards/{dash_id}/tabs/{default_tab_id}/sections",
            "POST",
            {"name": section_name},
        )
        if sec_resp.get("_error"):
            print(f"FATAL: section create failed for {section_name}: {sec_resp.get('_body')}")
            continue
        tab_after = [t for t in sec_resp["tabs"] if t["id"] == default_tab_id][0]
        section_id = tab_after["sections"][-1]["id"]
        print(f"\n[section] {section_name} ({section_id})")

        for tile_body in tiles:
            tile_resp = _req(
                f"/dashboards/{dash_id}/tabs/{default_tab_id}/sections/{section_id}/tiles",
                "POST",
                tile_body,
            )
            ct = tile_body.get("chartType", "?")
            title = tile_body.get("title", "?")
            if tile_resp.get("_error"):
                print(f"  FAIL {ct:20s} {title[:40]:40s} — {tile_resp.get('_body')[:120]}")
                results.append({"chart": ct, "status": "fail"})
            else:
                print(f"  PASS {ct:20s} {title[:40]:40s}")
                results.append({"chart": ct, "status": "pass"})

    print("\n" + "=" * 64)
    print("SUMMARY")
    print("=" * 64)
    passed = sum(1 for r in results if r["status"] == "pass")
    print(f"Dashboard ID: {dash_id}")
    print(f"Passed: {passed}/{len(results)}")
    print(f"\nOpen at: http://localhost:5174/analytics  (select 'Sample Dashboard')")


if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print(f"FATAL: {type(e).__name__}: {e}")
        sys.exit(1)
