"""Schema explorer API routes."""

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from typing import Optional
from auth import get_current_user
from user_storage import save_er_positions, load_er_positions

router = APIRouter(prefix="/api/v1/schema", tags=["schema"])


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


@router.get("/tables")
def list_tables(conn_id: Optional[str] = Query(None), user: dict = Depends(get_current_user)):
    """List all tables with their columns."""
    email = user["email"]
    entry = get_connection(conn_id, email)
    schema_info = entry.connector.get_schema_info()

    tables = []
    for table_name, info in schema_info.items():
        tables.append({
            "name": table_name,
            "columns": info["columns"],
            "primary_key": info["primary_key"],
            "foreign_keys": info["foreign_keys"],
            "column_count": len(info["columns"]),
        })

    return {"conn_id": entry.conn_id, "tables": tables}


@router.get("/ddl")
def get_ddl(conn_id: Optional[str] = Query(None), user: dict = Depends(get_current_user)):
    """Get CREATE TABLE statements for all tables."""
    email = user["email"]
    entry = get_connection(conn_id, email)
    return {"conn_id": entry.conn_id, "ddl": entry.connector.get_ddl()}


@router.get("/er-positions")
def get_er_positions(conn_id: Optional[str] = Query(None), user: dict = Depends(get_current_user)):
    """Load saved ER diagram table positions for a connection."""
    email = user["email"]
    entry = get_connection(conn_id, email)
    positions = load_er_positions(email, entry.conn_id)
    return {"conn_id": entry.conn_id, "positions": positions}


@router.put("/er-positions")
def put_er_positions(
    conn_id: Optional[str] = Query(None),
    body: dict = Body(...),
    user: dict = Depends(get_current_user),
):
    """Save ER diagram table positions for a connection."""
    email = user["email"]
    entry = get_connection(conn_id, email)
    positions = body.get("positions", {})
    save_er_positions(email, entry.conn_id, positions)
    return {"status": "saved", "conn_id": entry.conn_id}
