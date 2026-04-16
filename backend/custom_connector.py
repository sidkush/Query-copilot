"""
custom_connector.py — user-authored data source connectors.

Follows the Tableau Web Data Connector pattern: user provides a Python
class implementing ConnectorInterface, registers it, and AskDB queries
through it like any other database connection.

v1: defines the interface + a file-based registry. Actual sandboxed
execution deferred to future work.
"""
from abc import ABC, abstractmethod
from typing import Any

class ConnectorInterface(ABC):
    """Interface for user-authored data connectors."""

    @abstractmethod
    def get_schema(self) -> list[dict]:
        """Return table definitions: [{"name": "table", "columns": [{"name": "col", "type": "string"}]}]"""

    @abstractmethod
    def get_data(self, table_name: str, max_rows: int = 10000) -> dict:
        """Return {"columns": [...], "rows": [[...]]}"""

    @abstractmethod
    def test_connection(self) -> bool:
        """Verify the connector can reach its data source."""

# Built-in example: CSV file connector
class CsvConnector(ConnectorInterface):
    def __init__(self, file_path: str):
        self.file_path = file_path

    def get_schema(self) -> list[dict]:
        import csv
        with open(self.file_path, 'r') as f:
            reader = csv.reader(f)
            headers = next(reader, [])
        return [{"name": "data", "columns": [{"name": h, "type": "string"} for h in headers]}]

    def get_data(self, table_name: str, max_rows: int = 10000) -> dict:
        import csv
        with open(self.file_path, 'r') as f:
            reader = csv.reader(f)
            headers = next(reader, [])
            rows = [row for _, row in zip(range(max_rows), reader)]
        return {"columns": headers, "rows": rows}

    def test_connection(self) -> bool:
        from pathlib import Path
        return Path(self.file_path).exists()

# Registry
_CONNECTORS: dict[str, type] = {"csv": CsvConnector}

def register_connector(name: str, cls: type) -> None:
    _CONNECTORS[name] = cls

def get_connector(name: str) -> type | None:
    return _CONNECTORS.get(name)

def list_connectors() -> list[str]:
    return list(_CONNECTORS.keys())
