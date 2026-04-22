from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
from db_connector import DatabaseConnector
from query_engine import QueryEngine
from schema_intelligence import SchemaProfile

@dataclass
class ConnectionEntry:
    conn_id: str
    connector: DatabaseConnector
    engine: QueryEngine
    db_type: str
    database_name: str
    connected_at: datetime = field(default_factory=datetime.utcnow)
    schema_profile: object = None
    # Phase B — Ring 1 empirical grounding. Populated by background task
    # after schema_profile. None when FEATURE_DATA_COVERAGE disabled.
    coverage_cards: Optional[list] = None   # list[DataCoverageCard]
