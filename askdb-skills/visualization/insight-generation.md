# Insight Generation — AskDB AgentEngine

## AI Summary Structure

Every chart and dashboard gets an AI-generated summary. Use this structure:

```
1. HEADLINE FINDING (1 sentence)
   The single most important thing the data shows.
   Use specific numbers. State direction.

2. SUPPORTING EVIDENCE (1-2 sentences)
   What drives the headline. Key breakdown or comparison.

3. ANOMALY OR RISK (1 sentence, if present)
   What's surprising, concerning, or different from trend.

4. RECOMMENDED NEXT QUESTION (1 sentence)
   What the user should investigate next based on this data.
```

**Total length:** 3-5 sentences maximum. Never a paragraph essay.

## Headline Writing Rules

### Always include:
- A specific number or percentage
- A direction word (grew, declined, increased, dropped, accelerated)
- A time context (this quarter, vs last month, YoY)

### Good headlines:
- "Revenue grew 12% QoQ, driven by three enterprise expansions in July"
- "Churn improved 41bps — success team reorganization appears to be working"
- "EMEA conversion rate dropped 8pp in August — investigate sales team changes"
- "Day-30 retention at 34%, down 5pp vs prior cohort — onboarding may be a factor"

### Bad headlines (avoid):
- "Revenue increased" — no number, no context
- "The chart shows revenue by month for the last 12 months" — describing, not interpreting
- "There are some interesting patterns in this data" — vague
- "Revenue is $8.2M" — single number with no interpretation

## Confidence Language Calibration

Match language strength to data strength:

| Confidence | Language | When to use |
|-----------|----------|-------------|
| High | "X drove Y", "caused by", "explains" | Strong correlation, large effect, consistent pattern |
| Medium | "appears to be", "likely driven by", "suggests" | Correlation present, causation uncertain |
| Low | "may be related to", "worth investigating", "could indicate" | Weak signal, small sample, one-off |
| Speculative | "one hypothesis is...", "if X, then..." | No direct data support, inference only |

**Never state causation without evidence.** Correlation in charts ≠ causation.

## Anomaly Detection in Summaries

Flag these patterns automatically when detected:

| Pattern | Summary language |
|---------|----------------|
| Single spike (> 2σ from trend) | "Unusual spike on [date] — [magnitude] above trend" |
| Sudden drop (> 20% single period) | "Sharp decline in [period] — investigate [possible cause from context]" |
| Trend reversal | "Trend reversed in [month] — previously [direction], now [direction]" |
| Consistent outperformer | "[Entity] consistently leads by [X]% — benchmark against peers" |
| Consistent underperformer | "[Entity] tracking [X]% below average — may need attention" |
| Plateau after growth | "Growth rate flattened since [date] — from [X]% to [Y]% MoM" |

## Context-Aware Recommendations

Base next question on the data domain and what's visible:

| Domain | Anomaly seen | Suggested next question |
|--------|-------------|------------------------|
| Sales | Churn spike | "Which customers churned? What's their tenure distribution?" |
| Sales | Win rate drop | "Where in the funnel are deals dying? Break down by stage." |
| Product | Retention drop | "Which user segments show the biggest retention decline?" |
| Marketing | CAC spike | "Which channel's CAC increased most? Compare channel efficiency." |
| Finance | Margin compression | "Which product line has the worst gross margin? Break down COGS." |
| Operations | Latency spike | "Which endpoint or service is causing the latency increase?" |

## Data Quality Notes in Summaries

Always surface data quality issues when detected:

```
"Note: [Column] contains [X]% missing values — averages exclude these rows."
"Note: Data for the last 2 days may be incomplete — final numbers refresh at 9am."
"Note: [Date range] shows zero values — verify data pipeline for this period."
"Note: [Entity] appears to have duplicate records — counts may be inflated."
```

## Board Pack Narrative Format (Extended)

For Board Pack theme, generate longer editorial narrative:

```
HEADLINE (large, bold): "The Quarter Was Made in July"

BODY (2-3 paragraphs):
P1: Quantitative summary of the period. Key metric movements with context.
P2: Breakdown of drivers — what contributed and what detracted.
P3: Forward-looking risk or opportunity. Specific action recommended.

HIGHLIGHTED CALLOUT: The single most important number, styled prominently.

AI DRAFTED label + REVIEWED status indicator
```

---

## Examples

**Data:** Monthly revenue: $1.5M → $1.6M → $1.7M → $2.1M (last month)
**Headline:** "Revenue accelerated to $2.1M in April — 24% MoM jump, fastest growth in 8 months"
**Supporting:** "Three enterprise expansions in week 3 contributed $290K net new MRR — 61% of monthly growth"
**Anomaly:** "Mid-market added only 12 new logos vs 22 last month — pipeline coverage at 2.1x (target 3x)"
**Next question:** "Which enterprise accounts expanded and what triggered the acceleration?"

**Data:** D30 retention: 42% → 40% → 37% → 34% (declining trend)
**Headline:** "Day-30 retention declined 8pp over last 4 cohorts — now at 34%, below 40% target"
**Supporting:** "Decline started with the February cohort, coinciding with onboarding redesign"
**Anomaly:** "Power users (3+ sessions week 1) retain at 67% — activation quality predicts retention strongly"
**Next question:** "What % of new users reach the 3+ session activation threshold by day 7?"
