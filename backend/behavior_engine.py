"""
Predictive User Behavior Intelligence Engine.

Generates next-action predictions from user's query history, schema context,
and (later) compacted behavioral profiles. Phase 1 uses only existing data
(query_stats, chat_history, schema) — no new tracking required.
"""

import json
import logging
import re
import time
from datetime import datetime, timezone
from typing import Optional

from config import settings
from user_storage import list_chats, load_chat, load_query_stats

_logger = logging.getLogger(__name__)

# ── Skill Level Detection (#4) ──────────────────────────────────

_ADVANCED_SQL_PATTERNS = [
    r"\bWITH\b",           # CTEs
    r"\bOVER\s*\(",        # Window functions
    r"\bROW_NUMBER\b",
    r"\bRANK\b",
    r"\bLAG\b",
    r"\bLEAD\b",
    r"\bPARTITION\s+BY\b",
    r"\bUNION\b",
    r"\bINTERSECT\b",
    r"\bEXCEPT\b",
    r"\bCASE\s+WHEN\b",
    r"\bHAVING\b",
    r"\bEXISTS\s*\(",
    r"\bCOALESCE\b",
    r"\bCAST\b",
    r"\bSUBSTRING\b",
    r"\bREGEXP\b",
    r"\bCROSS\s+JOIN\b",
    r"\bFULL\s+OUTER\b",
    r"\bLATERAL\b",
]

_INTERMEDIATE_SQL_PATTERNS = [
    r"\bJOIN\b",
    r"\bLEFT\s+JOIN\b",
    r"\bINNER\s+JOIN\b",
    r"\bGROUP\s+BY\b",
    r"\bORDER\s+BY\b",
    r"\bDISTINCT\b",
    r"\bCOUNT\b",
    r"\bSUM\b",
    r"\bAVG\b",
    r"\bMAX\b",
    r"\bMIN\b",
    r"\bLIKE\b",
    r"\bIN\s*\(",
    r"\bBETWEEN\b",
]


def detect_skill_level(sql_history: list[str]) -> str:
    """Classify user skill level from their SQL history.

    Returns: 'beginner', 'intermediate', or 'advanced'
    """
    if not sql_history:
        return "beginner"

    advanced_count = 0
    intermediate_count = 0

    for sql in sql_history:
        sql_upper = sql.upper()
        for pattern in _ADVANCED_SQL_PATTERNS:
            if re.search(pattern, sql_upper):
                advanced_count += 1
                break
        for pattern in _INTERMEDIATE_SQL_PATTERNS:
            if re.search(pattern, sql_upper):
                intermediate_count += 1
                break

    total = len(sql_history)
    if total == 0:
        return "beginner"

    advanced_ratio = advanced_count / total
    intermediate_ratio = intermediate_count / total

    if advanced_ratio >= 0.2:
        return "advanced"
    elif intermediate_ratio >= 0.3:
        return "intermediate"
    return "beginner"


# ── Intent Disambiguation (#15) ──────────────────────────────────

def build_term_map(chat_messages: list[dict]) -> dict[str, str]:
    """Build a term→meaning map from user's query history.

    Extracts ambiguous terms and maps them to their most frequent
    SQL-resolved meaning. E.g., "growth" → "revenue growth" if 85% of
    queries containing "growth" resolved to revenue-related SQL.
    """
    term_contexts = {}

    for msg in chat_messages:
        question = msg.get("question", "")
        sql = msg.get("sql", "")
        if not question or not sql:
            continue

        words = set(re.findall(r"\b[a-z]{3,}\b", question.lower()))
        for word in words:
            if word not in term_contexts:
                term_contexts[word] = []
            # Store a short SQL context for this term usage
            term_contexts[word].append(sql[:200])

    # Only keep terms used 3+ times (enough data for disambiguation)
    term_map = {}
    for term, sql_contexts in term_contexts.items():
        if len(sql_contexts) < 3:
            continue
        # Extract the most common table/column referenced with this term
        table_refs = []
        for sql in sql_contexts:
            tables = re.findall(r"\bFROM\s+(\w+)", sql, re.IGNORECASE)
            table_refs.extend(tables)
        if table_refs:
            from collections import Counter
            most_common = Counter(table_refs).most_common(1)[0]
            if most_common[1] >= len(sql_contexts) * 0.5:  # 50%+ consistency
                term_map[term] = most_common[0]

    return term_map


# ── Schema Domain Detection (#21) ────────────────────────────────

_DOMAIN_PATTERNS = {
    "healthcare": [
        r"patient", r"diagnosis", r"treatment", r"prescription",
        r"medical", r"clinical", r"hospital", r"pharmacy", r"icd",
        r"procedure", r"lab_result", r"vital", r"appointment",
    ],
    "finance": [
        r"transaction", r"account", r"balance", r"ledger",
        r"portfolio", r"stock", r"trade", r"revenue", r"invoice",
        r"payment", r"loan", r"credit", r"debit", r"fiscal",
    ],
    "ecommerce": [
        r"order", r"product", r"cart", r"customer", r"shipping",
        r"catalog", r"inventory", r"sku", r"purchase", r"refund",
    ],
    "marketing": [
        r"campaign", r"click", r"impression", r"conversion",
        r"segment", r"channel", r"engagement", r"funnel", r"lead",
        r"utm", r"bounce", r"attribution",
    ],
    "hr": [
        r"employee", r"salary", r"department", r"payroll",
        r"attendance", r"leave", r"recruitment", r"performance",
        r"onboarding", r"benefit",
    ],
    "education": [
        r"student", r"course", r"enrollment", r"grade",
        r"faculty", r"semester", r"curriculum", r"assignment",
        r"transcript",
    ],
    "logistics": [
        r"shipment", r"warehouse", r"route", r"delivery",
        r"tracking", r"fleet", r"carrier", r"freight",
    ],
}

_DOMAIN_TONES = {
    "healthcare": "healthcare data specialist reporting clinical insights to your department head",
    "finance": "senior financial analyst presenting findings to your portfolio manager",
    "ecommerce": "e-commerce analytics lead reporting to your VP of Growth",
    "marketing": "marketing analytics specialist reporting campaign performance to your CMO",
    "hr": "HR analytics advisor presenting workforce insights to your CHRO",
    "education": "educational data analyst reporting institutional metrics to your Dean",
    "logistics": "supply chain analyst reporting operational metrics to your logistics director",
    "general": "senior data analyst presenting findings to your manager",
}


def detect_domain(schema_info: dict) -> str:
    """Detect the domain of a database from its schema (table/column names)."""
    if not schema_info:
        return "general"

    text = ""
    for table_name, info in schema_info.items():
        text += f" {table_name}"
        for col in info.get("columns", []):
            text += f" {col.get('name', '')}"

    text_lower = text.lower()
    scores = {}
    for domain, patterns in _DOMAIN_PATTERNS.items():
        score = sum(1 for p in patterns if re.search(p, text_lower))
        if score > 0:
            scores[domain] = score

    if not scores:
        return "general"
    return max(scores, key=scores.get)


def get_analyst_tone(domain: str) -> str:
    """Get the immutable analyst persona tone instruction for a domain."""
    return _DOMAIN_TONES.get(domain, _DOMAIN_TONES["general"])


# ── Analyst Personas (#10) ──────────────────────────────────────────

PERSONA_DEFINITIONS = {
    "explorer": {
        "name": "Explorer",
        "icon": "compass",
        "description": "Curious and broad — explores data from multiple angles, suggests follow-ups, surfaces unexpected patterns.",
        "system_instruction": (
            "You are in EXPLORER mode. Be curious and expansive:\n"
            "- Proactively suggest related questions and alternative angles\n"
            "- When showing results, highlight surprising or non-obvious patterns\n"
            "- Prefer visualizations that reveal distributions and relationships (scatter, heatmap, treemap)\n"
            "- Use language like 'Interestingly...', 'This suggests...', 'You might also want to look at...'\n"
            "- Generate slightly more complex queries that join multiple tables when relevant\n"
            "- After each answer, suggest 2 natural follow-up directions"
        ),
    },
    "auditor": {
        "name": "Auditor",
        "icon": "shield-check",
        "description": "Precise and conservative — focuses on accuracy, validation, and edge cases.",
        "system_instruction": (
            "You are in AUDITOR mode. Be precise and conservative:\n"
            "- Prioritize data accuracy and completeness over speed\n"
            "- Flag potential data quality issues (NULLs, duplicates, outliers)\n"
            "- Include record counts and validation checks in queries\n"
            "- Use language like 'Note that...', 'Caveat:...', 'This excludes...'\n"
            "- Prefer tabular output over charts; when charting, use bar/line for clarity\n"
            "- Always mention the sample size and any filters applied\n"
            "- Warn about potential misinterpretations of the data"
        ),
    },
    "storyteller": {
        "name": "Storyteller",
        "icon": "book-open",
        "description": "Narrative and visual — turns data into compelling stories with rich context.",
        "system_instruction": (
            "You are in STORYTELLER mode. Turn data into narratives:\n"
            "- Frame every answer as a brief story: setup → insight → implication\n"
            "- Use rich, contextual language: 'Revenue surged 23% — driven primarily by...'\n"
            "- Prefer visually compelling charts (area, donut, treemap, stacked bar)\n"
            "- Compare to benchmarks or previous periods when possible\n"
            "- Summarize with executive-ready bullet points\n"
            "- Use metaphors and analogies to make numbers tangible\n"
            "- End with a clear 'So what?' takeaway"
        ),
    },
}

VALID_PERSONAS = set(PERSONA_DEFINITIONS.keys())


def get_persona_instruction(persona: str) -> str:
    """Get the system prompt instruction for a given persona."""
    if not settings.FEATURE_PERSONAS:
        return ""
    defn = PERSONA_DEFINITIONS.get(persona)
    if not defn:
        return ""
    return defn["system_instruction"]


def list_personas() -> list[dict]:
    """Return all available persona definitions (for UI rendering)."""
    return [
        {"id": k, "name": v["name"], "icon": v["icon"], "description": v["description"]}
        for k, v in PERSONA_DEFINITIONS.items()
    ]


# ── Time Pattern Detection (#5) ───────────────────────────────────

_DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
_PERIOD_NAMES = {(5, 12): "morning", (12, 17): "afternoon", (17, 21): "evening", (21, 5): "night"}


def _get_period(hour: int) -> str:
    if 5 <= hour < 12:
        return "morning"
    elif 12 <= hour < 17:
        return "afternoon"
    elif 17 <= hour < 21:
        return "evening"
    return "night"


def extract_time_patterns(recent_queries: list[dict]) -> dict:
    """Analyze temporal patterns from query timestamps.

    Returns: {
        "current_context": "Monday morning",
        "patterns": ["On Mondays you typically check revenue", ...],
        "peak_hours": [9, 10, 14],
    }
    """
    if not recent_queries:
        return {}

    from collections import Counter

    now = datetime.now(timezone.utc)
    current_day = _DAY_NAMES[now.weekday()]
    current_period = _get_period(now.hour)

    # Parse timestamps and bucket by day+period
    day_period_topics = {}  # "Monday_morning" → [questions]
    hour_counts = Counter()

    for q in recent_queries:
        ts = q.get("timestamp", "")
        if not ts:
            continue
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            day = _DAY_NAMES[dt.weekday()]
            period = _get_period(dt.hour)
            key = f"{day}_{period}"
            if key not in day_period_topics:
                day_period_topics[key] = []
            day_period_topics[key].append(q["question"][:100])
            hour_counts[dt.hour] += 1
        except (ValueError, IndexError):
            continue

    # Find patterns for current time slot
    current_key = f"{current_day}_{current_period}"
    patterns = []
    if current_key in day_period_topics:
        topics = day_period_topics[current_key]
        if len(topics) >= 2:
            # Extract common theme from repeated time-slot queries
            patterns.append(
                f"On {current_day} {current_period}s you've previously asked: "
                + "; ".join(topics[:3])
            )

    # Find peak hours
    peak_hours = [h for h, c in hour_counts.most_common(3)] if hour_counts else []

    return {
        "current_context": f"{current_day} {current_period}",
        "patterns": patterns[:3],
        "peak_hours": peak_hours,
    }


# ── Recent Query Extraction ──────────────────────────────────────

def extract_recent_queries(email: str, limit: int = 20) -> list[dict]:
    """Extract recent queries from user's chat history.

    Returns list of {question, sql, timestamp} sorted by recency.
    """
    chats = list_chats(email)
    recent = []

    for chat_summary in chats[:10]:  # Check last 10 chats
        try:
            chat = load_chat(email, chat_summary["chat_id"])
            if not chat:
                continue
            for msg in chat.get("messages", []):
                if msg.get("type") in ("sql_preview", "result") and msg.get("question"):
                    recent.append({
                        "question": msg["question"][:200],
                        "sql": (msg.get("sql") or msg.get("rawSQL", ""))[:300],
                        "timestamp": chat.get("updated_at", ""),
                    })
        except Exception:
            continue

    # Sort by timestamp descending, take most recent
    recent.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return recent[:limit]


# ── Prediction Generation (#1) ────────────────────────────────────

def generate_predictions(
    email: str,
    schema_info: dict,
    conn_id: str = "",
    db_type: str = "",
    current_question: str = "",
    current_sql: str = "",
) -> list[dict]:
    """Generate 3 predictive next-action suggestions.

    Phase 1: Derives predictions from existing query history + schema.
    No new tracking required. Uses Claude Haiku for generation.

    Returns: [{"question": str, "reasoning": str, "confidence": float}]
    """
    if not settings.FEATURE_PREDICTIONS:
        return []

    try:
        from provider_registry import get_provider_for_user

        # Gather context from existing data
        recent_queries = extract_recent_queries(email, limit=10)
        stats = load_query_stats(email)
        skill_level = detect_skill_level([q["sql"] for q in recent_queries if q.get("sql")])
        domain = detect_domain(schema_info)

        # Build schema summary (compact)
        schema_lines = []
        for table_name, info in list(schema_info.items())[:30]:
            safe_table = re.sub(r"[^\w\s._-]", "", str(table_name))[:80]
            cols = ", ".join(
                re.sub(r"[^\w\s._-]", "", str(c["name"]))[:40]
                for c in info.get("columns", [])[:8]
            )
            schema_lines.append(f"{safe_table}({cols})")

        # Build recent query context
        query_context = ""
        if recent_queries:
            query_lines = []
            for q in recent_queries[:6]:
                query_lines.append(f"- {q['question']}")
            query_context = "Recent questions asked:\n" + "\n".join(query_lines)

        # Build disambiguation context
        term_map = {}
        if settings.FEATURE_INTENT_DISAMBIGUATION and recent_queries:
            all_msgs = []
            for q in recent_queries:
                all_msgs.append({"question": q["question"], "sql": q["sql"]})
            term_map = build_term_map(all_msgs)

        disambiguation_hint = ""
        if term_map:
            hints = [f'"{k}" usually means {v}-related' for k, v in list(term_map.items())[:5]]
            disambiguation_hint = "\nUser's terminology patterns: " + "; ".join(hints)

        # Current context
        current_context = ""
        if current_question:
            current_context = f"\nUser just asked: {current_question[:200]}"
            if current_sql:
                current_context += f"\nSQL generated: {current_sql[:200]}"

        # Time-awareness context
        time_hint = ""
        if settings.FEATURE_TIME_PATTERNS and recent_queries:
            time_data = extract_time_patterns(recent_queries)
            if time_data.get("current_context"):
                time_hint = f"\nCurrent time context: {time_data['current_context']}."
            if time_data.get("patterns"):
                time_hint += "\nTemporal patterns: " + "; ".join(time_data["patterns"][:2])

        # Style matching hint
        style_hint = ""
        if settings.FEATURE_STYLE_MATCHING and recent_queries:
            style = detect_communication_style([q["question"] for q in recent_queries if q.get("question")])
            if style.get("formality"):
                style_hint = f"\nUser communication style: {style['formality']}, {style['verbosity']}, {style['technicality']}. Match predicted questions to this style."

        # Skill-level instruction
        complexity_hint = ""
        if settings.FEATURE_ADAPTIVE_COMPLEXITY:
            if skill_level == "advanced":
                complexity_hint = "\nUser is an advanced SQL user — suggest sophisticated analytical questions involving CTEs, window functions, multi-table joins."
            elif skill_level == "intermediate":
                complexity_hint = "\nUser is intermediate — suggest questions with joins, aggregations, comparisons."
            else:
                complexity_hint = "\nUser is a beginner — suggest clear, approachable questions. Avoid complex SQL jargon."

        prompt = f"""You are a predictive analytics engine. Based on the user's database schema, recent query history, and current context, predict the 3 most likely questions they will ask next.

Database schema:
{chr(10).join(schema_lines[:20])}

{query_context}
{current_context}
{disambiguation_hint}
{time_hint}
{complexity_hint}
{style_hint}

Rules:
- Each prediction must reference actual tables/columns in the schema
- Predictions should feel like natural follow-ups to what the user has been exploring
- If they just asked about revenue, predict drill-downs or related dimensions
- If no history, predict high-value starter questions for this specific database type
- Rank by likelihood (most likely first)

Return ONLY a JSON array of exactly 3 objects:
[{{"question": "the predicted question", "reasoning": "1-sentence why", "confidence": 0.0-1.0}}]
Return ONLY valid JSON, no markdown fences."""

        provider = get_provider_for_user(email)
        response = provider.complete(
            model=provider.default_model, system="",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=400,
        )
        text = response.text.strip()

        # Parse JSON (handle markdown fences)
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        predictions = json.loads(text)
        if not isinstance(predictions, list):
            return []

        # Validate and sanitize
        result = []
        for pred in predictions[:3]:
            if not isinstance(pred, dict) or "question" not in pred:
                continue
            result.append({
                "question": str(pred["question"])[:300],
                "reasoning": str(pred.get("reasoning", ""))[:200],
                "confidence": min(1.0, max(0.0, float(pred.get("confidence", 0.5)))),
            })
        return result

    except Exception as e:
        _logger.warning("Prediction generation failed: %s", str(e)[:200])
        return []


# ── Autocomplete / Typing Prediction (#9) ────────────────────────

def generate_autocomplete(
    email: str,
    partial: str,
    schema_info: dict,
    limit: int = 5,
) -> list[dict]:
    """Generate autocomplete suggestions for a partial query input.

    Fast, deterministic — no LLM call. Matches against:
    1. Recent query history (prefix + fuzzy substring match)
    2. Schema table/column names
    3. Common analytical question templates

    Returns: [{"text": str, "source": "history"|"schema"|"template"}]
    """
    if not settings.FEATURE_AUTOCOMPLETE or not partial or len(partial) < 2:
        return []

    partial_lower = partial.lower().strip()
    suggestions = []
    seen = set()

    # 1. Match against recent query history
    recent = extract_recent_queries(email, limit=30)
    for q in recent:
        question = q.get("question", "")
        q_lower = question.lower()
        if q_lower.startswith(partial_lower) or partial_lower in q_lower:
            if question not in seen:
                seen.add(question)
                # Boost prefix matches
                score = 2.0 if q_lower.startswith(partial_lower) else 1.0
                suggestions.append({"text": question, "source": "history", "_score": score})

    # 2. Generate schema-aware completions
    if schema_info:
        tables = list(schema_info.keys())[:50]
        for table in tables:
            t_lower = table.lower()
            if partial_lower in t_lower or t_lower in partial_lower:
                template = f"Show me data from {table}"
                if template not in seen:
                    seen.add(template)
                    suggestions.append({"text": template, "source": "schema", "_score": 0.8})

            # Column-level matches
            for col in schema_info[table].get("columns", [])[:10]:
                col_name = col.get("name", "")
                c_lower = col_name.lower()
                if len(partial_lower) >= 3 and (partial_lower in c_lower or c_lower in partial_lower):
                    template = f"What are the values in {table}.{col_name}?"
                    if template not in seen:
                        seen.add(template)
                        suggestions.append({"text": template, "source": "schema", "_score": 0.6})

    # 3. Common analytical templates that match partial input
    _TEMPLATES = [
        "Show me the top 10 {table} by {column}",
        "What is the total {column} grouped by {category}?",
        "How has {column} changed over time?",
        "Compare {column} across different {category}",
        "What are the outliers in {column}?",
        "Show me the distribution of {column}",
        "What is the average {column} per {category}?",
    ]
    keywords = partial_lower.split()
    trigger_words = {"top", "total", "average", "compare", "how", "show", "what", "distribution", "outlier"}
    if keywords and keywords[0] in trigger_words:
        for tmpl in _TEMPLATES:
            if any(kw in tmpl.lower() for kw in keywords):
                # Fill template with first available table/column
                filled = tmpl
                if schema_info:
                    first_table = next(iter(schema_info))
                    cols = schema_info[first_table].get("columns", [])
                    filled = filled.replace("{table}", first_table)
                    if cols:
                        filled = filled.replace("{column}", cols[0].get("name", "value"))
                        if len(cols) > 1:
                            filled = filled.replace("{category}", cols[1].get("name", "category"))
                        else:
                            filled = filled.replace("{category}", cols[0].get("name", "category"))
                if filled not in seen and "{" not in filled:
                    seen.add(filled)
                    suggestions.append({"text": filled, "source": "template", "_score": 0.5})

    # Sort by score descending, return top N
    suggestions.sort(key=lambda x: x.get("_score", 0), reverse=True)
    return [{"text": s["text"], "source": s["source"]} for s in suggestions[:limit]]


# ── Insight Chains (#11) — Cross-Session Resume ──────────────────

def _abstract_topic(question: str) -> str:
    """Map a question to an abstract topic category."""
    if not question:
        return "unknown"
    q = question.lower()
    categories = [
        (r"revenue|sales|income|earning", "revenue_analysis"),
        (r"cost|expense|spend|budget", "cost_analysis"),
        (r"customer|user|client|account", "customer_analysis"),
        (r"product|item|sku|catalog", "product_analysis"),
        (r"time|trend|growth|decline|over time", "trend_analysis"),
        (r"compare|vs|versus|difference", "comparison"),
        (r"anomal|outlier|unusual|spike", "anomaly_detection"),
        (r"top|best|worst|rank|leader", "ranking"),
        (r"count|total|sum|average|aggregate", "aggregation"),
        (r"segment|group|categor|breakdown", "segmentation"),
    ]
    for pattern, topic in categories:
        if re.search(pattern, q):
            return topic
    return "general_query"


def extract_insight_chains(email: str, limit: int = 5) -> list[dict]:
    """Extract topic threads from recent queries that the user might want to resume."""
    if not settings.FEATURE_INSIGHT_CHAINS:
        return []

    recent = extract_recent_queries(email, limit=40)
    if len(recent) < 3:
        return []

    topic_threads = {}
    for q in recent:
        question = q.get("question", "")
        if not question:
            continue
        topic = _abstract_topic(question)
        if topic not in topic_threads:
            topic_threads[topic] = []
        topic_threads[topic].append(q)

    chains = []
    for topic, queries in topic_threads.items():
        if len(queries) < 2:
            continue
        last = queries[0]
        chains.append({
            "topic": topic,
            "last_question": last["question"][:200],
            "query_count": len(queries),
            "last_session": last.get("timestamp", ""),
            "resume_suggestion": f"Continue exploring {topic.replace('_', ' ')}? Last: \"{last['question'][:80]}\"",
        })

    chains.sort(key=lambda x: x["query_count"], reverse=True)
    return chains[:limit]


# ── Connection Auto-Switch (#6) ──────────────────────────────────

def predict_connection(
    question: str,
    connections: dict,
    email: str = "",
) -> Optional[str]:
    """Predict which database connection best matches the user's question.

    Uses schema keyword matching + historical usage patterns.
    Returns: conn_id or None if no confident prediction.
    """
    if not settings.FEATURE_AUTO_SWITCH or not question or not connections:
        return None

    question_lower = question.lower()
    scores = {}

    for conn_id, entry in connections.items():
        score = 0.0
        # Match against database name
        db_name = getattr(entry, "database_name", "") or ""
        if db_name and db_name.lower() in question_lower:
            score += 5.0

        # Match against schema table/column names
        try:
            schema_info = entry.engine.db.get_schema_info() if entry.engine else {}
            for table_name in schema_info:
                if table_name.lower() in question_lower:
                    score += 3.0
                for col in schema_info[table_name].get("columns", [])[:10]:
                    col_name = col.get("name", "")
                    if len(col_name) > 3 and col_name.lower() in question_lower:
                        score += 1.0
        except Exception:
            pass

        # Match against db_type keywords
        db_type = getattr(entry, "db_type", "") or ""
        if db_type and db_type.lower() in question_lower:
            score += 2.0

        if score > 0:
            scores[conn_id] = score

    if not scores:
        return None

    best = max(scores, key=scores.get)
    # Only suggest if confidence is meaningful (score > 2)
    return best if scores[best] > 2.0 else None


# ── Proactive Anomaly Detection (#7) ─────────────────────────────

def detect_anomalies(rows: list[list], columns: list[str]) -> list[dict]:
    """Detect statistical anomalies in query result data.

    Uses simple IQR (interquartile range) method on numeric columns.
    Returns: [{"column": str, "value": any, "row_index": int,
               "direction": "high"|"low", "message": str}]
    """
    if not settings.FEATURE_ANOMALY_ALERTS or not rows or not columns:
        return []

    anomalies = []

    for col_idx, col_name in enumerate(columns):
        # Extract numeric values
        values = []
        for row_idx, row in enumerate(rows):
            if col_idx < len(row):
                try:
                    val = float(row[col_idx])
                    values.append((row_idx, val))
                except (ValueError, TypeError):
                    continue

        if len(values) < 5:
            continue  # Need enough data for statistical analysis

        nums = [v[1] for v in values]
        nums_sorted = sorted(nums)
        n = len(nums_sorted)
        q1 = nums_sorted[n // 4]
        q3 = nums_sorted[(3 * n) // 4]
        iqr = q3 - q1

        if iqr == 0:
            continue  # No variance

        lower_bound = q1 - 1.5 * iqr
        upper_bound = q3 + 1.5 * iqr

        for row_idx, val in values:
            if val > upper_bound:
                anomalies.append({
                    "column": col_name,
                    "value": val,
                    "row_index": row_idx,
                    "direction": "high",
                    "message": f"{col_name} value {val:,.2f} is unusually high (expected below {upper_bound:,.2f})",
                })
            elif val < lower_bound:
                anomalies.append({
                    "column": col_name,
                    "value": val,
                    "row_index": row_idx,
                    "direction": "low",
                    "message": f"{col_name} value {val:,.2f} is unusually low (expected above {lower_bound:,.2f})",
                })

    # Limit to top 5 most extreme anomalies
    anomalies.sort(key=lambda a: abs(a["value"]), reverse=True)
    return anomalies[:5]


# ── Smart Pre-loading (#8) ───────────────────────────────────────

def predict_preload_targets(email: str) -> list[dict]:
    """Predict which dashboards/tiles the user will likely view next.

    Uses page visit frequency from behavior profile + time-of-day patterns.
    Returns: [{"type": "dashboard"|"page", "id": str, "reason": str}]
    """
    if not settings.FEATURE_SMART_PRELOAD:
        return []

    from user_storage import load_behavior_profile, list_dashboards

    profile = load_behavior_profile(email)
    targets = []

    # Page prediction from visit frequency
    page_visits = profile.get("page_visits", {})
    if page_visits:
        top_pages = sorted(page_visits.items(), key=lambda x: x[1], reverse=True)[:3]
        for page, count in top_pages:
            if count >= 2:
                targets.append({
                    "type": "page",
                    "id": page,
                    "reason": f"You visit {page} frequently ({count} visits)",
                })

    # Dashboard prediction — most recently used
    dashboards = list_dashboards(email)
    if dashboards:
        for d in dashboards[:2]:
            targets.append({
                "type": "dashboard",
                "id": d.get("id", ""),
                "name": d.get("name", ""),
                "reason": "Recently used dashboard",
            })

    # Time-based prediction
    recent = extract_recent_queries(email, limit=10)
    if recent and settings.FEATURE_TIME_PATTERNS:
        time_data = extract_time_patterns(recent)
        if time_data.get("patterns"):
            targets.append({
                "type": "hint",
                "id": "time_pattern",
                "reason": time_data["patterns"][0],
            })

    return targets[:5]


# ── Data Pre-caching (#14) ───────────────────────────────────────

def get_precache_queries(email: str, schema_info: dict, limit: int = 3) -> list[str]:
    """Identify queries worth pre-caching based on prediction + history.

    Returns a list of SQL strings that are likely to be needed soon.
    These can be executed in the background to warm the cache.
    """
    if not settings.FEATURE_DATA_PREP:
        return []

    recent = extract_recent_queries(email, limit=10)
    if not recent:
        return []

    # Find repeated query patterns (same SQL structure, different params)
    sql_patterns = {}
    for q in recent:
        sql = q.get("sql", "")
        if not sql:
            continue
        # Normalize: strip literals to find structural patterns
        normalized = re.sub(r"'[^']*'", "'?'", sql)
        normalized = re.sub(r"\b\d+\b", "?", normalized)
        if normalized not in sql_patterns:
            sql_patterns[normalized] = []
        sql_patterns[normalized].append(sql)

    # Return the most recent concrete SQL for the top repeated patterns
    precache = []
    for pattern, sqls in sorted(sql_patterns.items(), key=lambda x: len(x[1]), reverse=True):
        if len(sqls) >= 2:
            precache.append(sqls[0])  # Most recent concrete version

    return precache[:limit]


# ── Workflow Templates (#16) ──────────────────────────��──────────

def detect_workflow_patterns(email: str, min_occurrences: int = 2) -> list[dict]:
    """Detect repeated query sequences that could become workflow templates.

    Looks for 2-3 query sequences that appear in the same order across
    multiple sessions. Returns detected workflows with their steps.

    Returns: [{"name": str, "steps": [{"question": str, "topic": str}],
               "occurrences": int, "confidence": float}]
    """
    if not settings.FEATURE_WORKFLOW_TEMPLATES:
        return []

    recent = extract_recent_queries(email, limit=50)
    if len(recent) < 4:
        return []

    # Build sequence of (topic, question) pairs
    sequence = []
    for q in reversed(recent):  # Oldest first
        topic = _abstract_topic(q.get("question", ""))
        sequence.append((topic, q.get("question", "")[:100]))

    # Find repeated 2-grams and 3-grams of topic sequences
    ngram_counts = {}
    for n in (2, 3):
        for i in range(len(sequence) - n + 1):
            gram = tuple(s[0] for s in sequence[i:i + n])
            if gram not in ngram_counts:
                ngram_counts[gram] = {
                    "steps": [{"question": s[1], "topic": s[0]} for s in sequence[i:i + n]],
                    "count": 0,
                }
            ngram_counts[gram]["count"] += 1

    # Filter to repeated patterns
    workflows = []
    for gram, data in ngram_counts.items():
        if data["count"] >= min_occurrences:
            # Skip trivial patterns (all same topic)
            if len(set(gram)) < 2:
                continue
            name = " -> ".join(t.replace("_", " ").title() for t in gram)
            workflows.append({
                "name": name,
                "steps": data["steps"],
                "occurrences": data["count"],
                "confidence": min(1.0, data["count"] / 5.0),
            })

    workflows.sort(key=lambda w: w["occurrences"], reverse=True)
    return workflows[:5]


# ── Skill Gap Detection (#17) ────────────────────────────────────

_SQL_FEATURES = {
    "Window Functions": {
        "patterns": [r"\bOVER\s*\(", r"\bROW_NUMBER\b", r"\bRANK\b", r"\bLAG\b", r"\bLEAD\b", r"\bPARTITION\s+BY\b"],
        "description": "Calculate running totals, rankings, and comparisons within groups",
        "example": "Show each employee's salary rank within their department",
        "level": "advanced",
    },
    "CTEs (WITH clauses)": {
        "patterns": [r"\bWITH\b.*\bAS\s*\("],
        "description": "Break complex queries into readable, reusable named subqueries",
        "example": "Find customers whose total spending exceeds the average",
        "level": "advanced",
    },
    "CASE Expressions": {
        "patterns": [r"\bCASE\s+WHEN\b"],
        "description": "Add conditional logic directly in SQL for categorization",
        "example": "Categorize orders as small/medium/large based on amount",
        "level": "intermediate",
    },
    "Subqueries": {
        "patterns": [r"\bEXISTS\s*\(", r"\bIN\s*\(\s*SELECT\b"],
        "description": "Nest queries for filtering or computed values",
        "example": "Find products that have never been ordered",
        "level": "intermediate",
    },
    "Aggregation": {
        "patterns": [r"\bGROUP\s+BY\b", r"\bHAVING\b"],
        "description": "Summarize data with grouping and post-aggregation filters",
        "example": "Show total revenue per region, but only regions with revenue over 100K",
        "level": "intermediate",
    },
    "JOINs": {
        "patterns": [r"\bJOIN\b", r"\bLEFT\s+JOIN\b", r"\bINNER\s+JOIN\b"],
        "description": "Combine data from multiple related tables",
        "example": "List customers with their most recent order details",
        "level": "intermediate",
    },
    "Date Functions": {
        "patterns": [r"\bDATE_TRUNC\b", r"\bEXTRACT\b", r"\bDATEDIFF\b", r"\bDATE_ADD\b"],
        "description": "Manipulate and analyze date/time data",
        "example": "Show monthly revenue trends for the last 12 months",
        "level": "intermediate",
    },
    "String Functions": {
        "patterns": [r"\bSUBSTRING\b", r"\bCONCAT\b", r"\bREGEXP\b", r"\bREPLACE\b"],
        "description": "Transform and search text data",
        "example": "Extract domain names from email addresses",
        "level": "intermediate",
    },
}


def detect_skill_gaps(email: str) -> list[dict]:
    """Identify SQL features the user hasn't used yet.

    Compares user's SQL history against known feature patterns.
    Returns unused features appropriate to their next skill level.
    """
    if not settings.FEATURE_SKILL_GAPS:
        return []

    recent = extract_recent_queries(email, limit=30)
    sql_history = [q["sql"] for q in recent if q.get("sql")]
    if not sql_history:
        return []

    skill_level = detect_skill_level(sql_history)
    all_sql = " ".join(sql_history).upper()

    # Find features the user hasn't used
    gaps = []
    for feature_name, info in _SQL_FEATURES.items():
        # Skip features above the user's next level
        if skill_level == "beginner" and info["level"] == "advanced":
            continue

        used = any(re.search(p, all_sql) for p in info["patterns"])
        if not used:
            gaps.append({
                "feature": feature_name,
                "description": info["description"],
                "example_question": info["example"],
                "level": info["level"],
            })

    # Sort: intermediate features first for beginners, advanced for intermediate users
    target_level = "intermediate" if skill_level == "beginner" else "advanced"
    gaps.sort(key=lambda g: (0 if g["level"] == target_level else 1))
    return gaps[:5]


# ── Collaborative Prediction (#12) ───────────────────────────────

def get_collaborative_suggestions(email: str, schema_info: dict) -> list[dict]:
    """Generate suggestions based on what similar users commonly ask.

    Only works when consent_level >= 2 (collaborative).
    Aggregates anonymous topic patterns across users with similar schemas.
    """
    if not settings.FEATURE_COLLABORATIVE:
        return []

    from user_storage import load_behavior_profile

    profile = load_behavior_profile(email)
    if profile.get("consent_level", 0) < 2:
        return []  # User hasn't opted into collaborative features

    # Detect the domain of the current schema
    domain = detect_domain(schema_info)

    # Build suggestions based on domain + common patterns
    # Phase 1: Use domain-specific templates (no actual cross-user data yet)
    _DOMAIN_SUGGESTIONS = {
        "finance": [
            "What's the month-over-month revenue growth rate?",
            "Show me the top 10 accounts by transaction volume",
            "What's the cash flow trend for the last quarter?",
        ],
        "ecommerce": [
            "What's the average order value by customer segment?",
            "Show me the funnel conversion rate by step",
            "Which products have the highest return rate?",
        ],
        "healthcare": [
            "What's the average length of stay by diagnosis?",
            "Show readmission rates by department",
            "Which treatments have the best outcomes?",
        ],
        "marketing": [
            "What's the cost per acquisition by channel?",
            "Show me the campaign ROI comparison",
            "Which segments have the highest engagement?",
        ],
        "general": [
            "What's the distribution of records across categories?",
            "Show me the trend over the last 12 months",
            "Which are the top 10 by volume?",
        ],
    }

    suggestions = _DOMAIN_SUGGESTIONS.get(domain, _DOMAIN_SUGGESTIONS["general"])
    return [
        {"question": q, "source": "collaborative", "domain": domain}
        for q in suggestions[:3]
    ]


# ── NL Style Matching (#13) ──────��─────────────────────────��──────

def detect_communication_style(questions: list[str]) -> dict:
    """Detect user's natural language style from their query history.

    Analyzes formality, verbosity, and technicality to build a style profile.
    Returns: {"formality": "formal"|"casual", "verbosity": "concise"|"verbose",
              "technicality": "technical"|"plain", "instruction": str}
    """
    if not settings.FEATURE_STYLE_MATCHING or not questions:
        return {}

    total = len(questions)
    if total < 3:
        return {}  # Need enough data to detect a pattern

    # Formality indicators
    formal_markers = [
        r"\bplease\b", r"\bkindly\b", r"\bcould you\b", r"\bwould you\b",
        r"\bI would like\b", r"\bprovide\b", r"\bregarding\b",
    ]
    casual_markers = [
        r"\bhey\b", r"\bwhat's\b", r"\bshow me\b", r"\bgive me\b",
        r"\bjust\b", r"\bquick\b", r"\bbtw\b", r"\blike\b",
    ]

    # Verbosity — avg word count
    word_counts = [len(q.split()) for q in questions]
    avg_words = sum(word_counts) / total

    # Technicality markers
    technical_markers = [
        r"\bjoin\b", r"\baggregate\b", r"\bgroup by\b", r"\bfilter\b",
        r"\bindex\b", r"\bpartition\b", r"\bwindow\b", r"\bsubquery\b",
        r"\bschema\b", r"\bnormalize\b", r"\bcardinality\b",
    ]

    formal_score = 0
    casual_score = 0
    technical_score = 0

    for q in questions:
        q_lower = q.lower()
        for pat in formal_markers:
            if re.search(pat, q_lower):
                formal_score += 1
                break
        for pat in casual_markers:
            if re.search(pat, q_lower):
                casual_score += 1
                break
        for pat in technical_markers:
            if re.search(pat, q_lower):
                technical_score += 1
                break

    formality = "formal" if formal_score > casual_score else "casual"
    verbosity = "verbose" if avg_words > 12 else "concise"
    technicality = "technical" if technical_score / total > 0.3 else "plain"

    # Build adaptive instruction
    parts = []
    if formality == "formal":
        parts.append("Use professional, structured language. Address findings formally.")
    else:
        parts.append("Keep the tone conversational and direct. Skip unnecessary formalities.")

    if verbosity == "concise":
        parts.append("Be brief — lead with the answer, add detail only if needed.")
    else:
        parts.append("Provide thorough explanations with context and reasoning.")

    if technicality == "technical":
        parts.append("Use technical SQL/data terminology freely — the user is comfortable with it.")
    else:
        parts.append("Explain in plain language — avoid jargon unless the user introduces it.")

    return {
        "formality": formality,
        "verbosity": verbosity,
        "technicality": technicality,
        "instruction": " ".join(parts),
    }
