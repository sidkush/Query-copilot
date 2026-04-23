---
applies_to: sql-generation
depends_on:
  - schema-linking-evidence
  - schema-profiling
description: Does an explicit FK constraint exist? YES → Use it directly. Highest
  confidence. NO → Run column name inference (see schema-profiling.md) → If...
legacy: true
name: join-intelligence
priority: 3
tokens_budget: 1500
---

# Join Intelligence — AskDB AgentEngine

## Join Decision Tree

```
Does an explicit FK constraint exist?
  YES → Use it directly. Highest confidence.
  NO  → Run column name inference (see schema-profiling.md)
       → If match found with >90% value overlap: CONFIDENT join
       → If match found with 50-90% overlap: Use join, warn about data quality
       → If no name match: Check value overlap across all candidate pairs
       → If still ambiguous: Ask user
```

## Join Type Selection

| Scenario | Join Type | Reason |
|----------|-----------|--------|
| Standard lookup (order → customer) | INNER JOIN | Only orders with valid customers |
| Show all records even if no match | LEFT JOIN | Preserve all left-table rows |
| "Orders without customers" | LEFT JOIN + WHERE right.id IS NULL | Anti-join pattern |
| Symmetric unmatched records | FULL OUTER JOIN | Both sides preserved |
| Many-to-many through junction table | Two INNER JOINs | fact → junction → dimension |
| Self-reference (employee → manager) | Self-JOIN with aliases | Same table, different roles |

## Fan-Out Detection and Prevention

Fan-out = joining tables where a row in the left table matches multiple rows in the right table, inflating aggregations.

**Detection:**
```sql
-- Check if join would cause fan-out
SELECT COUNT(*) as rows_in_a,
       COUNT(DISTINCT a.id) as distinct_ids_in_a
FROM table_a a
JOIN table_b b ON a.id = b.a_id;
-- If rows_in_a >> distinct_ids_in_a → FAN-OUT DETECTED
```

**Prevention options:**
1. Pre-aggregate the many-side before joining:
   ```sql
   WITH agg AS (
     SELECT a_id, SUM(amount) as total
     FROM table_b GROUP BY a_id
   )
   SELECT a.*, agg.total FROM table_a a
   LEFT JOIN agg ON a.id = agg.a_id
   ```
2. Use subquery instead of direct join
3. If user wants detail-level: join is correct, just don't aggregate

## Many-to-Many Relationships

Always join through the junction table. Never join directly.

```sql
-- WRONG: Direct join (Cartesian product)
SELECT p.name, o.order_id
FROM products p
JOIN orders o ON p.id = o.product_id  -- if order_items exists, this is wrong

-- CORRECT: Through junction table
SELECT p.name, o.order_id, oi.quantity
FROM products p
JOIN order_items oi ON p.id = oi.product_id
JOIN orders o ON oi.order_id = o.id
```

## Self-Referential Joins (Hierarchies)

For employee → manager, category → parent_category, etc.:

```sql
-- CORRECT: Self-join with aliasing
SELECT e.name as employee, 
       m.name as manager
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.id

-- Note: LEFT JOIN because top-level employees have no manager (NULL)
```

## Circular FK Detection

If schema has: A → B → C → A

**Detection:** Build adjacency graph from FK relationships. Run cycle detection (DFS). If cycle found:
1. Identify the weakest link (lowest overlap, or most logical "entry point")
2. Break at that link
3. Note in query: "Circular reference detected in schema. Starting from [table] as root."

## Multiple Valid Join Paths

When two paths exist to reach the same result:

**Example:** `orders` → `products` directly AND `orders` → `order_items` → `products`

**Rule:** Prefer the path that goes through the junction table if one exists. The direct FK on orders may be denormalized and potentially stale.

**If genuinely equivalent:** Choose the path with fewer joins. Disclose choice in summary.

## Ambiguous Foreign Keys (Same Column Name, Multiple Candidates)

**Example:** `reports` table has `user_id` — could join `users.id` OR `admins.id`

**Algorithm:**
1. Check value overlap with each candidate
2. Pick candidate with highest overlap (>90%)
3. If both >90%: Ask user
4. If neither >90%: Warn that join may be unreliable

## Cardinality Tagging (research-context §3.6 rule 8)

Tag every FK relationship before generating JOIN SQL:

| Tag | Definition | Detection heuristic |
|-----|------------|-------------------|
| 1:1 | Each left row matches ≤ 1 right row | FK column has UNIQUE constraint on the FK side |
| 1:N | One left row maps to many right rows | Standard FK (most dimension → fact relationships) |
| N:M | Many-to-many | Junction table with 2+ FK columns and no standalone PK measures |

**Rule:** Never `SUM` across a N:M join without pre-aggregating one side first (§3.6 rule 1). Fact-to-fact direct joins are always N:M unless filtered to 1 row.

```sql
-- Cardinality check before aggregating:
SELECT COUNT(*) as rows, COUNT(DISTINCT a.id) as unique_ids
FROM table_a a JOIN table_b b ON a.id = b.a_id;
-- If rows >> unique_ids → N:M → pre-aggregate b before joining
```

## Bridge-Table Detection (research-context §3.6 rule 4)

A bridge table (junction table) has exactly 2 FK columns pointing to different parent tables and no aggregate-measure columns of its own.

Examples: `order_items(order_id, product_id, quantity)`, `user_roles(user_id, role_id)`, `course_enrollments(student_id, course_id, enrolled_at)`.

**Rule:** When a bridge table exists between two entities, **always route through it** — never join the two parent tables directly.

```sql
-- WRONG: direct join creates Cartesian fan-out
SELECT p.name, o.order_id
FROM products p JOIN orders o ON p.id = o.product_id;

-- CORRECT: through the bridge table
SELECT p.name, o.order_id, oi.quantity
FROM products p
JOIN order_items oi ON p.id = oi.product_id
JOIN orders o ON oi.order_id = o.id;
```

## Post-Execution Row-Count Sanity (research-context §3.6 rule 5)

After `run_sql` returns results, compare result rows to expected source grain:

```python
# Pseudo-logic in agent post-execution check
if result_row_count > expected_source_rows * 10:
    emit_warning(
        f"⚠ Fan-out detected: result has {result_row_count} rows "
        f"vs source grain ~{expected_source_rows}. "
        "Possible missing GROUP BY or N:M join without pre-aggregation. "
        "Verify aggregation logic before presenting this data."
    )
```

Surface to user as: `"⚠ Result ({N} rows) is {X}× larger than the source table ({M} rows) — possible fan-out from a many-to-many join. Check aggregation logic."`

---

## Examples

**Input:** "Show me total revenue by customer name"
**Schema:** `orders(customer_id, amount)`, `customers(id, name)` — no explicit FK
**Inference:** `orders.customer_id → customers.id` (name match, assume high overlap)
**Output:**
```sql
SELECT c.name, SUM(o.amount) as total_revenue
FROM orders o
JOIN customers c ON o.customer_id = c.id
GROUP BY c.name
ORDER BY total_revenue DESC;
```

**Input:** "Show me each employee and their manager"
**Schema:** `employees(id, name, manager_id)` — self-referential
**Output:**
```sql
SELECT e.name as employee_name,
       COALESCE(m.name, 'No Manager') as manager_name
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.id
ORDER BY m.name, e.name;
```

**Input:** "Show me products per order"
**Schema:** `orders`, `products`, `order_items(order_id, product_id, quantity)`
**Output:** Join through order_items. Never direct join orders → products.
