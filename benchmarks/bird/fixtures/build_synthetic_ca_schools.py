"""Build synthetic_ca_schools.sqlite — stable repo fixture for Wave 2 smoke.

Schema deliberately mirrors BIRD california_schools shape (column names,
join graph) so the wiring smoke exercises the same agent reasoning paths
the real benchmark will. Data is synthetic and small (50 schools).

Idempotent: deletes existing fixture and rebuilds from this script's seed
so the smoke is deterministic across runs.

Usage:
    python benchmarks/bird/fixtures/build_synthetic_ca_schools.py
"""
from __future__ import annotations

import random
import sqlite3
from pathlib import Path

FIXTURE_PATH = Path(__file__).resolve().parent / "synthetic_ca_schools.sqlite"
SEED = 42
N_SCHOOLS = 50


def build():
    if FIXTURE_PATH.exists():
        FIXTURE_PATH.unlink()

    rng = random.Random(SEED)
    conn = sqlite3.connect(FIXTURE_PATH)
    cur = conn.cursor()

    cur.executescript("""
        CREATE TABLE schools (
            CDSCode TEXT PRIMARY KEY,
            School TEXT NOT NULL,
            District TEXT NOT NULL,
            County TEXT NOT NULL
        );
        CREATE TABLE frpm (
            CDSCode TEXT PRIMARY KEY,
            Free_Meal_Count_K_12 INTEGER,
            Enrollment_K_12 INTEGER,
            FOREIGN KEY (CDSCode) REFERENCES schools(CDSCode)
        );
        CREATE TABLE satscores (
            cds TEXT PRIMARY KEY,
            AvgScrMath INTEGER,
            FOREIGN KEY (cds) REFERENCES schools(CDSCode)
        );
    """)

    counties = ["Los Angeles", "San Diego", "Orange", "Alameda", "Santa Clara"]
    districts = ["Unified", "Elementary", "High School", "Charter"]
    school_types = ["Lincoln", "Washington", "Roosevelt", "Jefferson", "Madison",
                    "Adams", "Monroe", "Jackson", "Polk", "Tyler"]

    for i in range(N_SCHOOLS):
        cds = f"19{i:08d}"
        county = rng.choice(counties)
        district = f"{county} {rng.choice(districts)}"
        school = f"{rng.choice(school_types)} {rng.choice(['Elementary', 'Middle', 'High'])}"
        cur.execute(
            "INSERT INTO schools (CDSCode, School, District, County) VALUES (?, ?, ?, ?)",
            (cds, school, district, county),
        )

        enrollment = rng.randint(150, 2500)
        free_pct = rng.uniform(0.05, 0.95)
        free_count = int(enrollment * free_pct)
        cur.execute(
            "INSERT INTO frpm (CDSCode, Free_Meal_Count_K_12, Enrollment_K_12) VALUES (?, ?, ?)",
            (cds, free_count, enrollment),
        )

        if rng.random() < 0.7:
            cur.execute(
                "INSERT INTO satscores (cds, AvgScrMath) VALUES (?, ?)",
                (cds, rng.randint(380, 720)),
            )

    conn.commit()
    conn.close()
    print(f"Built {FIXTURE_PATH} ({N_SCHOOLS} schools, seed={SEED})")


if __name__ == "__main__":
    build()
