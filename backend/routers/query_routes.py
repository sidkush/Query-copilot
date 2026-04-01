"""Query API routes — human-in-the-loop SQL generation and execution."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from auth import get_current_user
from user_storage import increment_query_stats, get_daily_usage

router = APIRouter(prefix="/api/queries", tags=["queries"])


def get_connection(conn_id: Optional[str] = None, email: str = ""):
    """Look up a connection from user-scoped app.state.connections.
    If conn_id is None, default to the first available connection for the user.
    """
    from main import app
    connections = app.state.connections.get(email, {})
    if not connections:
        raise HTTPException(status_code=400, detail="No active database connections")
    if conn_id is not None:
        entry = connections.get(conn_id)
        if entry is None:
            raise HTTPException(status_code=404, detail=f"Connection '{conn_id}' not found")
        return entry
    # Default to the first connection
    return next(iter(connections.values()))


class AskRequest(BaseModel):
    question: str
    conn_id: Optional[str] = None


class ExecuteRequest(BaseModel):
    sql: str
    question: str = ""
    conn_id: Optional[str] = None


class FeedbackRequest(BaseModel):
    question: str
    sql: str
    is_correct: bool
    conn_id: Optional[str] = None


@router.post("/generate")
def generate_sql(req: AskRequest, user: dict = Depends(get_current_user)):
    """Step 1: Generate SQL from natural language. Returns SQL for user review."""
    from main import app
    email = user["email"]

    if req.conn_id == "all":
        results = []
        user_conns = app.state.connections.get(email, {})
        for cid, entry in user_conns.items():
            result = entry.engine.generate_sql(req.question)
            result_dict = result.to_dict()
            result_dict["conn_id"] = cid
            result_dict["db_type"] = entry.db_type
            result_dict["database_name"] = entry.database_name
            results.append(result_dict)
        return {"multi": True, "results": results}

    entry = get_connection(req.conn_id, email)
    result = entry.engine.generate_sql(req.question)
    result_dict = result.to_dict()
    result_dict["conn_id"] = entry.conn_id
    result_dict["db_type"] = entry.db_type
    result_dict["database_name"] = entry.database_name
    return result_dict


@router.post("/execute")
def execute_sql(req: ExecuteRequest, user: dict = Depends(get_current_user)):
    """Step 2: Execute user-approved SQL against the database."""
    from main import app
    email = user["email"]

    # Check daily limit before executing
    usage = get_daily_usage(email)
    if not usage["unlimited"] and usage["remaining"] <= 0:
        raise HTTPException(
            status_code=429,
            detail=f"Daily query limit reached ({usage['daily_limit']} queries/day on {usage['plan']} plan). Upgrade your plan for more queries."
        )

    if req.conn_id == "all":
        results = []
        user_conns = app.state.connections.get(email, {})
        for cid, entry in user_conns.items():
            result = entry.engine.execute_sql(req.sql, req.question)
            increment_query_stats(email, result.latency_ms, result.error is None)
            result_dict = result.to_dict()
            result_dict["conn_id"] = cid
            result_dict["db_type"] = entry.db_type
            result_dict["database_name"] = entry.database_name
            result_dict["is_big_data"] = entry.connector.is_big_data_engine()
            results.append(result_dict)
        usage_after = get_daily_usage(email)
        return {"multi": True, "results": results, "daily_usage": usage_after}

    entry = get_connection(req.conn_id, email)
    result = entry.engine.execute_sql(req.sql, req.question)
    increment_query_stats(email, result.latency_ms, result.error is None)
    result_dict = result.to_dict()
    result_dict["conn_id"] = entry.conn_id
    result_dict["db_type"] = entry.db_type
    result_dict["database_name"] = entry.database_name
    result_dict["is_big_data"] = entry.connector.is_big_data_engine()
    result_dict["daily_usage"] = get_daily_usage(email)
    return result_dict


@router.post("/feedback")
def record_feedback(req: FeedbackRequest, user: dict = Depends(get_current_user)):
    """Record user feedback on query accuracy."""
    email = user["email"]
    entry = get_connection(req.conn_id, email)
    entry.engine.record_feedback(req.question, req.sql, req.is_correct)
    return {"status": "ok", "conn_id": entry.conn_id}


@router.get("/stats")
def get_stats(conn_id: Optional[str] = Query(None), user: dict = Depends(get_current_user)):
    """Get engine training statistics."""
    email = user["email"]
    entry = get_connection(conn_id, email)
    stats = entry.engine.get_stats()
    stats["conn_id"] = entry.conn_id
    stats["db_type"] = entry.db_type
    stats["database_name"] = entry.database_name
    return stats


@router.get("/suggestions")
def get_suggestions(conn_id: Optional[str] = Query(None), user: dict = Depends(get_current_user)):
    """Generate AI-powered query suggestions based on the connected schema."""
    email = user["email"]
    entry = get_connection(conn_id, email)
    engine = entry.engine
    if not engine:
        return {"suggestions": [], "conn_id": conn_id}

    try:
        import anthropic
        from config import settings

        schema_info = engine.db.get_schema_info()
        if not schema_info:
            return {"suggestions": [], "conn_id": entry.conn_id}

        # Build a concise schema summary
        schema_summary = []
        for table_name, info in schema_info.items():
            cols = ", ".join(c["name"] for c in info["columns"][:10])
            schema_summary.append(f"Table: {table_name} ({cols})")

        prompt = (
            "Given this database schema:\n\n"
            + "\n".join(schema_summary)
            + "\n\nGenerate 6 useful natural language questions a business user might ask about this data. "
            "Return ONLY the questions, one per line, no numbering, no explanations."
        )

        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = client.messages.create(
            model=settings.PRIMARY_MODEL,
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}]
        )
        text = response.content[0].text.strip()
        suggestions = [line.strip().lstrip("0123456789.-) ") for line in text.split("\n") if line.strip()]
        return {
            "suggestions": suggestions[:8],
            "conn_id": entry.conn_id,
            "db_type": entry.db_type,
            "database_name": entry.database_name,
        }
    except Exception:
        return {"suggestions": [], "conn_id": entry.conn_id}


class DashboardRequest(BaseModel):
    request: str
    conn_id: Optional[str] = None


@router.post("/generate-dashboard")
def generate_dashboard(req: DashboardRequest, user: dict = Depends(get_current_user)):
    """Generate a complete dashboard with multiple executed queries."""
    email = user["email"]
    conn_id = req.conn_id

    if conn_id == "all":
        raise HTTPException(status_code=400, detail="Dashboard generation requires a specific connection")

    entry = get_connection(conn_id, email)
    engine = entry.engine
    if not engine:
        raise HTTPException(status_code=400, detail="No query engine for this connection")

    try:
        tiles = engine.generate_dashboard(req.request)
        if not tiles:
            raise HTTPException(status_code=400, detail="Could not generate dashboard tiles from the available schema")

        return {
            "tiles": tiles,
            "conn_id": entry.conn_id,
            "db_type": entry.db_type,
            "database_name": entry.database_name,
        }
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dashboard generation failed: {str(e)}")
