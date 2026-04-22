"""Deterministic fixture populator.

Run: python -m backend.tests.fixtures.eval_seed <path-to-db.sqlite>
Seeds ~2000 rows spanning Dec 2023 through Oct 2025 so that the deceptive
`january_trips` table actually contains 23 months of data (the original bug).
"""
import argparse
import datetime as dt
import random
import sqlite3
from pathlib import Path


def seed(db_path: Path) -> None:
    schema = (Path(__file__).parent / "eval_schema.sql").read_text()
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(schema)

        rng = random.Random(42)

        # customers (100 rows)
        customers = []
        for i in range(100):
            created = dt.datetime(2023, 10, 1) + dt.timedelta(days=rng.randint(0, 700))
            deleted = created + dt.timedelta(days=rng.randint(30, 200)) if rng.random() < 0.15 else None
            email = f"user{i}@example.com"
            region = rng.choice(["NA", "EU", "APAC", "LATAM"])
            customers.append((i, email, created.isoformat(), deleted.isoformat() if deleted else None, region))
        conn.executemany(
            "INSERT INTO customers VALUES (?, ?, ?, ?, ?)",
            customers,
        )

        # orders (500 rows)
        orders = []
        for i in range(500):
            cid = rng.randint(0, 99)
            amount = rng.randint(500, 500000)  # cents
            status = rng.choice(["paid", "refunded", "pending"])
            created = dt.datetime(2024, 1, 1) + dt.timedelta(minutes=rng.randint(0, 60 * 24 * 400))
            orders.append((i, cid, amount, status, created.isoformat()))
        conn.executemany(
            "INSERT INTO orders VALUES (?, ?, ?, ?, ?)",
            orders,
        )

        # events (800 rows)
        events = []
        for i in range(800):
            cid = rng.randint(0, 99)
            ev = rng.choice(["login", "view", "click", "purchase"])
            ts = dt.datetime(2024, 1, 1) + dt.timedelta(minutes=rng.randint(0, 60 * 24 * 500))
            events.append((i, cid, ev, ts.isoformat()))
        conn.executemany(
            "INSERT INTO events VALUES (?, ?, ?, ?)",
            events,
        )

        # subscriptions (80 rows)
        subs = []
        for i in range(80):
            cid = rng.randint(0, 99)
            plan = rng.choice(["free", "pro", "enterprise"])
            started = dt.datetime(2024, 1, 1) + dt.timedelta(days=rng.randint(0, 500))
            canceled = started + dt.timedelta(days=rng.randint(30, 200)) if rng.random() < 0.25 else None
            subs.append((i, cid, plan, started.isoformat(), canceled.isoformat() if canceled else None))
        conn.executemany(
            "INSERT INTO subscriptions VALUES (?, ?, ?, ?, ?)",
            subs,
        )

        # january_trips: 500 rows, span Dec 2023 through Oct 2025 (23 months).
        # Despite the table name, data is NOT January-only. This is the origin bug.
        trips = []
        start = dt.date(2023, 12, 1)
        end = dt.date(2025, 10, 28)
        span_days = (end - start).days
        for i in range(500):
            rtype = rng.choice(["member", "casual"])
            when = start + dt.timedelta(days=rng.randint(0, span_days))
            duration = rng.randint(60, 3600)
            trips.append((i, rtype, when.isoformat(), duration))
        conn.executemany(
            "INSERT INTO january_trips VALUES (?, ?, ?, ?)",
            trips,
        )

        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("db_path", type=Path)
    args = parser.parse_args()
    args.db_path.parent.mkdir(parents=True, exist_ok=True)
    if args.db_path.exists():
        args.db_path.unlink()
    seed(args.db_path)
    print(f"Seeded fixture DB at {args.db_path}")
