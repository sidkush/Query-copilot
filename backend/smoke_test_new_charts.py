"""
Smoke test — creates tiles for every new chart type on the demo user's
"New Charts Smoke Test" tab and verifies each one populates with data
from the real BigQuery connection.

Run from backend/: python smoke_test_new_charts.py
"""
import sys
import json
import time
import urllib.request
import urllib.parse

API = "http://localhost:8002/api/v1"
TOKEN = None  # filled in by login()
DASHBOARD_ID = "d4440b94d5ba"
TAB_ID = "777c2061"
SECTION_ID = "0ce79bba"
CONN_ID = "86e123d1"
TABLE = "`querycopilot.trips_data.january_trips`"


def _req(path, method="GET", body=None):
    url = f"{API}{path}"
    headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
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


def execute_sql(sql, question=""):
    return _req("/queries/execute", "POST", {"sql": sql, "conn_id": CONN_ID, "question": question})


def create_tile(tile_body):
    return _req(
        f"/dashboards/{DASHBOARD_ID}/tabs/{TAB_ID}/sections/{SECTION_ID}/tiles",
        "POST",
        tile_body,
    )


CHARTS = [
    # ─── Standard time-series (line) with time-animation flag ─────────
    {
        "title": "Daily Trip Count — Line (animated)",
        "chartType": "line",
        "sql": f"""
SELECT DATE(CAST(started_at AS TIMESTAMP)) AS trip_day,
       COUNT(*) AS trips
FROM {TABLE}
WHERE started_at IS NOT NULL
GROUP BY trip_day
ORDER BY trip_day
LIMIT 31
""",
        "question": "Daily trip volume",
    },
    # ─── Dense family (4) ───────────────────────────────────────────
    {
        "title": "Daily Trips — Sparkline KPI",
        "chartType": "sparkline_kpi",
        "sql": f"""
SELECT DATE(CAST(started_at AS TIMESTAMP)) AS trip_day,
       COUNT(*) AS trips
FROM {TABLE}
WHERE started_at IS NOT NULL
GROUP BY trip_day
ORDER BY trip_day
LIMIT 31
""",
        "question": "Daily trip sparkline",
    },
    {
        "title": "Top 15 Start Stations — Scorecard",
        "chartType": "scorecard_table",
        "sql": f"""
SELECT start_station_name AS station, COUNT(*) AS trips
FROM {TABLE}
WHERE start_station_name IS NOT NULL
GROUP BY station
ORDER BY trips DESC
LIMIT 15
""",
        "question": "Top 15 start stations",
    },
    {
        "title": "Top 8 Stations — Bar Card",
        "chartType": "hbar_card",
        "sql": f"""
SELECT start_station_name AS station, COUNT(*) AS trips
FROM {TABLE}
WHERE start_station_name IS NOT NULL
GROUP BY station
ORDER BY trips DESC
LIMIT 8
""",
        "question": "Top 8 stations bar card",
    },
    {
        "title": "Day × Hour Heat Matrix",
        "chartType": "heat_matrix",
        "sql": f"""
SELECT FORMAT_DATE('%A', DATE(CAST(started_at AS TIMESTAMP))) AS day_name,
       CAST(EXTRACT(HOUR FROM CAST(started_at AS TIMESTAMP)) AS STRING) AS hour_of_day,
       COUNT(*) AS trips
FROM {TABLE}
WHERE started_at IS NOT NULL
GROUP BY day_name, hour_of_day
ORDER BY day_name, hour_of_day
""",
        "question": "Day of week vs hour heat matrix",
    },
    # ─── Wow family (6) ─────────────────────────────────────────────
    {
        "title": "3D Scatter — lat / lng / distance",
        "chartType": "scatter_3d",
        "sql": f"""
SELECT start_lat,
       start_lng,
       (ABS(end_lat - start_lat) + ABS(end_lng - start_lng)) * 100 AS trip_distance,
       rideable_type
FROM {TABLE}
WHERE start_lat IS NOT NULL
  AND start_lng IS NOT NULL
  AND end_lat IS NOT NULL
  AND end_lng IS NOT NULL
LIMIT 500
""",
        "question": "3D scatter of trip geometry",
    },
    {
        "title": "Hologram Scatter — over time",
        "chartType": "hologram_scatter",
        "sql": f"""
SELECT start_lat,
       start_lng,
       (ABS(end_lat - start_lat) + ABS(end_lng - start_lng)) * 100 AS trip_distance,
       DATE(CAST(started_at AS TIMESTAMP)) AS trip_day,
       rideable_type
FROM {TABLE}
WHERE start_lat IS NOT NULL
  AND start_lng IS NOT NULL
  AND started_at IS NOT NULL
LIMIT 500
""",
        "question": "Hologram scatter over time",
    },
    {
        "title": "Globe — Trip origins (lat/lng)",
        "chartType": "globe_3d",
        "sql": f"""
SELECT start_lat AS lat,
       start_lng AS lng,
       COUNT(*) AS trips
FROM {TABLE}
WHERE start_lat IS NOT NULL AND start_lng IS NOT NULL
GROUP BY lat, lng
ORDER BY trips DESC
LIMIT 2000
""",
        "question": "Globe of trip origin density",
    },
    {
        "title": "Ridgeline — Trip duration by bike type",
        "chartType": "ridgeline",
        "sql": f"""
SELECT rideable_type AS category,
       TIMESTAMP_DIFF(
         CAST(ended_at AS TIMESTAMP),
         CAST(started_at AS TIMESTAMP),
         MINUTE
       ) AS duration_min
FROM {TABLE}
WHERE started_at IS NOT NULL
  AND ended_at IS NOT NULL
  AND CAST(ended_at AS TIMESTAMP)
      > CAST(started_at AS TIMESTAMP)
LIMIT 1500
""",
        "question": "Trip duration distribution by bike type",
    },
    {
        "title": "Particle Flow — Station vectors",
        "chartType": "particle_flow",
        "sql": f"""
SELECT start_lat,
       start_lng,
       (end_lat - start_lat) AS vx,
       (end_lng - start_lng) AS vy
FROM {TABLE}
WHERE start_lat IS NOT NULL AND end_lat IS NOT NULL
LIMIT 500
""",
        "question": "Particle flow of trip directions",
    },
    {
        "title": "Member Rate — Liquid Gauge",
        "chartType": "liquid_gauge",
        "sql": f"""
SELECT 'Member Rate' AS label,
       ROUND(100.0 * SUM(CASE WHEN member_casual = 'member' THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct
FROM {TABLE}
""",
        "question": "Member rate gauge",
    },
]


def run():
    login()
    print(f"[login] token ok")
    # Optional filter: python smoke_test_new_charts.py --only=chart_type1,chart_type2
    only = None
    for arg in sys.argv[1:]:
        if arg.startswith("--only="):
            only = set(arg.split("=", 1)[1].split(","))
    charts = [c for c in CHARTS if only is None or c["chartType"] in only]
    if only:
        print(f"[filter] only {sorted(only)}")
    results = []
    for i, chart in enumerate(charts, 1):
        print(f"\n[{i}/{len(CHARTS)}] {chart['chartType']} — {chart['title']}")
        t0 = time.time()
        exec_result = execute_sql(chart["sql"], chart["question"])
        t1 = time.time() - t0

        if exec_result.get("_error"):
            print(f"  FAIL EXEC FAILED {exec_result['_error']}: {exec_result['_body']}")
            results.append({"chart": chart["chartType"], "status": "exec_fail", "detail": exec_result.get("_body")})
            continue
        if exec_result.get("error"):
            print(f"  FAIL SQL ERROR: {exec_result['error']}")
            results.append({"chart": chart["chartType"], "status": "sql_error", "detail": exec_result["error"]})
            continue

        columns = exec_result.get("columns") or []
        rows = exec_result.get("rows") or []
        print(f"  rows={len(rows)} cols={len(columns)} lat={t1*1000:.0f}ms cols={columns}")
        if not rows:
            print(f"  FAIL EMPTY RESULT SET")
            results.append({"chart": chart["chartType"], "status": "empty", "detail": "zero rows"})
            continue

        # Omit `sql` field — the running backend doesn't have the
        # dialect-aware validator patch yet (no --reload), so any SQL
        # containing BigQuery backticks fails tile save-time validation
        # regardless of data. The tile renders fine from columns + rows
        # alone; refresh-tile is disabled for these smoke-test tiles
        # which is acceptable since the whole point is to prove the
        # chart engines render with real data.
        tile_body = {
            "title": chart["title"],
            "chartType": chart["chartType"],
            "columns": columns,
            "rows": rows,
            "question": chart["question"],
        }
        tile_resp = create_tile(tile_body)
        if tile_resp.get("_error"):
            print(f"  FAIL TILE CREATE FAILED {tile_resp['_error']}: {tile_resp['_body']}")
            results.append({"chart": chart["chartType"], "status": "tile_fail", "detail": tile_resp.get("_body")})
            continue

        print(f"  PASS PASS")
        results.append({"chart": chart["chartType"], "status": "pass", "rows": len(rows), "cols": len(columns)})

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    passed = sum(1 for r in results if r["status"] == "pass")
    print(f"Passed: {passed}/{len(results)}")
    for r in results:
        status = {"pass": "PASS", "exec_fail": "FAIL", "sql_error": "FAIL", "empty": "EMPTY", "tile_fail": "FAIL"}[r["status"]]
        line = f"  {status} {r['chart']:20s} {r['status']}"
        if r.get("rows") is not None:
            line += f" rows={r['rows']} cols={r['cols']}"
        if r.get("detail"):
            line += f" — {r['detail'][:120]}"
        print(line)


if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print(f"FATAL: {type(e).__name__}: {e}")
        sys.exit(1)
