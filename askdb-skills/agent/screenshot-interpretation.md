---
applies_to: multi-step-agent, dashboard-build
description: 'Triggers when user uploads: - A screenshot of an existing dashboard
  (Tableau, Power BI, Looker, Excel, etc.) - A whiteboard sketch or hand-drawn...'
legacy: true
name: screenshot-interpretation
priority: 3
tokens_budget: 1300
---

# Screenshot Interpretation — AskDB AgentEngine

## When This Skill Activates

Triggers when user uploads:
- A screenshot of an existing dashboard (Tableau, Power BI, Looker, Excel, etc.)
- A whiteboard sketch or hand-drawn wireframe
- A photo of a printed report
- A mockup or design file screenshot
- A competitor's analytics UI

## Analysis Pipeline

```
Step 1: STRUCTURE DETECTION
  Identify the overall layout:
  - How many tiles/panels?
  - What is the grid structure (rows × columns)?
  - Which tiles are large vs small?
  - Are there tabs or sections?

Step 2: CHART TYPE IDENTIFICATION
  For each chart panel:
  - What chart type is it? (bar, line, scatter, table, KPI, map, etc.)
  - What appears to be the X axis? Y axis?
  - How many series/dimensions?
  - Is there a legend? What does it show?

Step 3: METRIC EXTRACTION
  What metrics/KPIs are visible?
  - Exact numbers if readable
  - Metric labels if readable
  - Delta/comparison indicators if visible

Step 4: DIMENSION DETECTION
  What grouping dimensions are visible?
  - Time dimensions (dates, months, quarters)
  - Category dimensions (region, product, segment)
  - Hierarchies if visible

Step 5: FILTER/CONTEXT DETECTION
  What filters or context are applied?
  - Date range selectors
  - Dropdown filters
  - Page-level filters visible

Step 6: QUALITY ASSESSMENT
  - Is the image clear enough to extract data?
  - Are labels readable?
  - Are numbers visible?
  - What level of confidence in the interpretation?
```

## Mapping Screenshot to AskDB Tile Spec

For each detected panel, generate a tile spec:

```python
def screenshot_panel_to_tile_spec(panel):
    return TileSpec(
        chart_type=detected_chart_type,
        title=detected_title or infer_from_axes(),
        x_dimension=detected_x_axis,
        y_metric=detected_y_axis,
        series_dimension=detected_legend_field,
        approximate_layout=GridPosition(
            row=panel.row, col=panel.col,
            width=panel.width_fraction, height=panel.height_fraction
        ),
        data_source="UNKNOWN — needs user confirmation"
    )
```

## Response Format After Analysis

```
I can see a dashboard with [N] panels. Here's what I detected:

Layout: [describe overall structure]

Panels detected:
1. [Panel name/title if visible]: [chart type] showing [metric] by [dimension]
2. [Panel name]: [chart type] showing [metric]
[... etc]

To rebuild this in AskDB, I'll need:
- [What data is required]
- [What tables/columns should map to what]

Shall I rebuild this dashboard? I'll need you to confirm:
□ What data source to connect to
□ Whether the column names match what I detected
□ [Any specific ambiguities]
```

## Confidence Levels in Interpretation

```
HIGH CONFIDENCE (state as fact):
- Chart types (bar, line, pie are visually unambiguous)
- Presence of KPI tiles
- General layout structure

MEDIUM CONFIDENCE (state as "appears to be"):
- Specific metric names from labels
- Dimension categories from axis labels
- Color coding meaning

LOW CONFIDENCE (state as "possibly" or ask):
- Exact numbers from small text
- Filter values from dropdowns
- Calculation logic behind a metric

UNKNOWN (explicitly flag):
- What data source powers the dashboard
- Whether a metric is calculated or raw
- Filter states not visible in screenshot
```

## Whiteboard/Sketch Interpretation

For hand-drawn wireframes:

```
More lenient interpretation:
- Boxes = tiles (any shape)
- Squiggly lines = line charts
- Vertical bars = bar charts
- Circles = pie/donut charts
- Numbers/text = KPI tiles
- Grid-like structures = data tables

Process:
1. Identify each drawn element
2. Map to closest AskDB tile type
3. Note position relative to other elements
4. Ask: "Is this what you're envisioning?"
5. Build from sketch description
```

## Privacy Protection

Before analyzing any screenshot:
- Never attempt to identify real people from profile photos or faces in screenshots
- If screenshot contains PII (names, emails, phone numbers): mask in any rebuilding
- If screenshot is of a competitor's system: analyze structure only, not business data

## Limitation Disclosure

Always disclose after screenshot analysis:

```
"I've analyzed the structure of this dashboard. I can rebuild the layout 
and chart types, but I'll need to connect it to your actual data — 
the numbers visible in the screenshot are from [source system], 
not your database. Once you connect your data, I'll generate 
equivalent queries to populate each tile."
```

---

## Examples

**Input:** Tableau dashboard screenshot with 4 charts
**Output:**
```
I can see a Tableau dashboard with 4 panels:

1. Top-left (KPI): Shows total revenue (~$8.2M) with growth indicator
2. Top-right (KPI): Shows win rate (~38%) with comparison
3. Bottom-left (bar chart): Appears to show pipeline by stage (6 stages)
4. Bottom-right (table): Looks like a deal list with columns for name, amount, stage

To rebuild this in AskDB, I'll need:
- Your CRM data (looks like Salesforce data structure)
- Confirm column names for: opportunities, pipeline stage, deal amount

Rebuild this? [Yes, connect my Salesforce] [I'll specify the data source]
```

**Input:** Whiteboard photo with boxes and squiggles
**Output:**
```
I can see a wireframe sketch with:
- 3 boxes in top row (probably KPI tiles)
- 1 wide squiggly area below (probably a line/trend chart)
- 2 equal boxes below that (probably side-by-side breakdown charts)

Is this a 3 KPI + trend + 2 breakdown layout? 
If so, what metrics should go in each position?
```
