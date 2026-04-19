# Voice Interaction Patterns — AskDB AgentEngine

## Voice vs Text Differences

Voice input is fundamentally different from typed text:

| Dimension | Voice | Text |
|-----------|-------|------|
| Precision | Low — spoken language is approximate | High — user thinks before typing |
| Pronouns | Heavy — "it", "that", "those", "them" | Less — user usually restates |
| Completeness | Often trails off or self-corrects | Usually complete thought |
| Numbers | Spoken out: "eight point two million" | Typed: $8.2M |
| Corrections | "Actually no, make it..." mid-sentence | User edits before sending |
| Commands | "Show me... uh... the top customers by..." | Direct commands |

## Pronoun Resolution in Voice

Voice users rely on context more heavily. Maintain a "last mentioned entity" pointer:

```
"Show me revenue by region"     → last_entity = revenue_by_region_chart
"Make it a bar chart"           → "it" = revenue_by_region_chart
"Now add it to the dashboard"   → "it" = the modified chart
"Filter that by Q1"             → "that" = same chart
"What about products?"          → new query — reset context
```

When ambiguous across 2 entities, resolve to most recently mentioned:
"Show me sales and orders — now filter it by enterprise"
→ "it" = both? Resolve to: apply enterprise filter to both queries.

## Number Parsing from Speech

| Spoken | Parsed |
|--------|--------|
| "eight point two million" | 8,200,000 |
| "thirty percent" | 30% |
| "top ten" | LIMIT 10 |
| "last thirty days" | date range: -30 days |
| "three K" | 3,000 |
| "a hundred thousand" | 100,000 |
| "double" | 2× / 200% growth |
| "half" | 50% / 0.5 |

## Voice Command Patterns

Map common spoken patterns to agent actions:

| Spoken pattern | Action |
|---------------|--------|
| "Show me [metric]" | Generate query + chart |
| "Add [metric] to the dashboard" | Create new tile |
| "Make it [chart type]" | Change chart type on current tile |
| "Filter by [dimension] [value]" | Add WHERE clause |
| "Break it down by [dimension]" | Add GROUP BY dimension |
| "Compare [period] to [period]" | Period-over-period query |
| "Make it bigger / smaller" | Resize tile |
| "Move it [position]" | Reposition tile |
| "Remove / delete [tile]" | Delete tile (confirm first) |
| "What does this mean?" | Generate extended AI explanation |
| "Drill down" | Show detail breakdown of current chart |
| "Go back" | Revert last change |

## Audio-Friendly Response Format

Voice responses should be readable aloud:

**Text-mode response:**
"Revenue grew 12.4% QoQ to $8.2M. Enterprise expansion contributed $290K — 61% of net new. Churn improved 41bps to 2.31%. Watch Waverly Capital (-4%)."

**Voice-mode response (same info):**
"Revenue is 8.2 million this quarter, up 12% from last quarter. Enterprise deals drove most of the growth. Churn improved slightly. One account to watch — Waverly Capital is trending down."

**Voice response rules:**
- No markdown (no **, ##, |tables|)
- No currency symbols (say "8.2 million dollars" not "$8.2M")
- No abbreviations (say "quarter over quarter" not "QoQ")
- Short sentences — pause opportunities for voice delivery
- End with a question or next step: "Want me to drill down on any of these?"

## Continuous Voice Mode

When voice mode is active (Whisper + WebSocket):

```
State machine:
IDLE → LISTENING (VAD detects speech) → PROCESSING (Whisper transcribes) → ACTING (agent executes) → SPEAKING (response) → IDLE

Rules during LISTENING:
- Buffer complete utterances (end detected by silence > 800ms)
- Allow "actually" or "no wait" as correction signals → discard last buffer

Rules during ACTING:
- Show visual progress (animated indicator)
- Don't start new LISTENING until ACTING complete
- Exception: User says "stop" → abort current action immediately

Rules during SPEAKING:
- Show text of response on screen simultaneously
- Allow interruption ("stop", "wait") → pause response
```

## Stage/Presentation Mode via Voice

When dashboard is in Stage mode:

Voice commands available:
- "Next slide / Next" → advance to next chapter/section
- "Go back / Previous" → retreat
- "Zoom in on [chart name]" → focus on specific chart
- "Explain this" → AI narrates the current chart
- "What's driving this?" → drill-down query on current chart
- "Pause" → freeze any animations
- "Full screen" → expand current tile

**Stage mode response format:** Even shorter. Maximum 2 sentences. Designed for real-time narration during presentations.

---

## Examples

**Voice input (raw transcript):** "show me uh... the top... the top ten customers by revenue this quarter"
**Parsed intent:** Top 10 customers by revenue, current quarter
**SQL generated:**
```sql
SELECT customer_name, SUM(revenue) as total_revenue
FROM orders
WHERE order_date >= DATE_TRUNC('quarter', CURRENT_DATE)
GROUP BY customer_name
ORDER BY total_revenue DESC
LIMIT 10;
```

**Voice input:** "make it a bar chart actually horizontal"
**Action:** Change current chart type to horizontal bar chart

**Voice input (Stage mode):** "explain this"
**Response (audio-friendly):**
"This chart shows monthly revenue over the last year. Revenue grew steadily through the first half, then accelerated sharply in July — driven by three large enterprise deals. The dashed line shows our forecast for the rest of the year."
