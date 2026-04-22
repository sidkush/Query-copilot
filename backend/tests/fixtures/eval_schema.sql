-- Fixture schema for golden eval. Mirrors typical ecommerce + trip shapes.
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  region TEXT NOT NULL
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  event_ts TEXT NOT NULL
);

CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  plan TEXT NOT NULL,
  started_at TEXT NOT NULL,
  canceled_at TEXT
);

-- Intentionally deceptive table name to exercise Ring 1 once Phase B ships.
CREATE TABLE january_trips (
  id INTEGER PRIMARY KEY,
  rider_type TEXT NOT NULL,       -- member | casual
  started_at TEXT NOT NULL,        -- 2023-12-01 to 2025-10-28
  duration_sec INTEGER NOT NULL
);
