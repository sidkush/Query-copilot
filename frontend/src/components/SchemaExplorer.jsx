import { useState, useEffect } from "react";
import { api } from "../api";

export default function SchemaExplorer() {
  const [tables, setTables] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getTables()
      .then((data) => setTables(data.tables))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-4 text-gray-500 text-sm">Loading schema...</div>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3 border-b border-gray-800">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Tables ({tables.length})
        </h3>
      </div>
      <div className="p-2">
        {tables.map((table) => (
          <div key={table.name} className="mb-1">
            <button
              onClick={() => setExpanded(expanded === table.name ? null : table.name)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-800 transition text-left cursor-pointer"
            >
              <span className="text-xs text-gray-500">{expanded === table.name ? "\u25BC" : "\u25B6"}</span>
              <span className="text-sm text-gray-300 font-medium">{table.name}</span>
              <span className="text-xs text-gray-600 ml-auto">{table.column_count} cols</span>
            </button>

            {expanded === table.name && (
              <div className="ml-5 mt-1 space-y-0.5">
                {table.columns.map((col) => (
                  <div key={col.name} className="flex items-center gap-2 px-2 py-1 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      table.primary_key.includes(col.name) ? "bg-yellow-500" : "bg-gray-600"
                    }`} />
                    <span className="text-gray-400">{col.name}</span>
                    <span className="text-gray-600 ml-auto font-mono">{col.type}</span>
                  </div>
                ))}
                {table.foreign_keys.length > 0 && (
                  <div className="mt-1 px-2">
                    {table.foreign_keys.map((fk, i) => (
                      <div key={i} className="text-xs text-blue-400/60">
                        {fk.columns.join(", ")} &rarr; {fk.referred_table}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
