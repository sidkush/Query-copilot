# Analytics — Cluster (K-means)

**Status:** Plan 9d (✅ Shipped 2026-04-20).

## What it does

Groups marks into K clusters using **K-means** with optional auto-selection of K via the **Calinski-Harabasz (CH) score**. Tableau-parity surface: same K-means engine, same CH-driven auto-k, same F-statistic / TotalSumOfSquares / WithinGroupSumOfSquares exposed in the dialog.

## When to use Auto vs Manual K

- **Auto** (default) — let CH pick the optimal K within `[k_min, k_max]`. CH rewards tight intra-cluster + wide inter-cluster separation. Best when you genuinely don't know how many groups exist.
- **Manual** — fix K when business logic dictates ("we want 4 customer tiers"). The engine still returns CH for the chosen K so you can compare against alternatives later.

## Why standardise is on by default

K-means uses Euclidean distance. A `salary` column with range `[30 000, 200 000]` will completely dominate a `years_at_company` column with range `[0, 30]` — the second feature contributes ~0% to cluster boundaries. **Standardisation (z-score) puts every feature on the same scale.** Turn it off only if your features are already commensurable (e.g. lat/long pairs).

## What disaggregate means

By default Tableau (and us) cluster **on the aggregated marks** as drawn — one row per mark in the view. With **Disaggregate Data** ticked the engine clusters every underlying record and assigns its cluster id back to whichever mark contains it. This is `SetDisaggregateFlag` in `tabdocclusteranalysis`. Use it when the per-record distribution matters (e.g. customer-level segmentation) and the marks are aggregated.

## How to read the stats badge

| Stat | Meaning |
|---|---|
| `optimal_k` | K chosen by Auto (or your manual choice) |
| `CH` | Calinski-Harabasz score; higher is better. Comparable across K for the same data |
| `F-statistic` | Equivalent ANOVA F: `CH × (n − k) / (k − 1)`. Surfaced for parity with Tableau |
| `inertia` | Within-group SSQ — total squared distance from each point to its centroid |
| `total_ssq` | Total SSQ if all points were in a single cluster |
| `between_group_ssq` | `total_ssq − inertia` — how much variance the clustering "explains" |

Click the badge to expand the full candidate list (every K tried, sorted by CH).

## When CH is undefined

CH requires `k ≥ 2` and at least two distinct cluster labels. We **clamp `k_min` to 2** automatically — this is noted in `result.notes` if the user passed `k_min=1`. If your data is a single tight blob, Auto-K will still pick `k=2` (the smallest valid K) but the CH will be uninformative — read it as "no real cluster structure."

## Cluster-as-Set

Right-click any entry in the cluster legend → **Create Set From Cluster**. This creates a Plan 4b set whose members are the row keys assigned to that cluster id. The set then participates in every set-aware action (filter source, IN/OUT calc input, dynamic zone visibility, etc.) — no special "cluster set" type, the same set machinery as user-authored sets.

## Limits

| Limit | Default | Setting |
|---|---|---|
| Rate limit | 10 calls / 60s per user | `CLUSTER_RATE_LIMIT_PER_60S` |
| Max input rows | 50 000 | `CLUSTER_MAX_ROWS` |
| Wall-clock timeout | 8 s | `CLUSTER_TIMEOUT_SECONDS` |
| Hard cap on `k_max` | 25 | `CLUSTER_K_MAX_HARD_CAP` |

Feature-flagged on `FEATURE_ANALYST_PRO`; returns `403` when disabled.

## Reserved Phase 16 hook

`result.per_cluster_feature_means` is computed but not surfaced in the UI yet — Phase 16 Explain Data integration uses it to answer "Cluster 2 skews high on Profit because…".
