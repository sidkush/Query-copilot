"""Backend port of the Show Me chart recommender.

Mirrors the logic in frontend/src/chart-ir/recommender/showMe.ts so the
agent can suggest charts without round-tripping through the frontend.
The output is a ChartSpec dict that conforms to the v1 JSON Schema.

Reference: docs/chart_systems_research.md §2.2 (Mackinlay rules)
"""
from __future__ import annotations

HIGH_CARDINALITY_THRESHOLD = 20


def _analyze_shape(columns: list[dict]) -> dict:
    """Compute result shape summary from column profiles."""
    dims = [c for c in columns if c.get('role') == 'dimension']
    measures = [c for c in columns if c.get('role') == 'measure']
    has_date = any(c.get('semantic_type') == 'temporal' for c in dims)
    has_geo = any(c.get('semantic_type') == 'geographic' for c in dims)
    max_card = max((c.get('cardinality', 0) for c in dims), default=0)
    return {
        'n_dims': len(dims),
        'n_measures': len(measures),
        'has_date': has_date,
        'has_geo': has_geo,
        'max_card': max_card,
        'has_high_card_dim': max_card > HIGH_CARDINALITY_THRESHOLD,
        'dims': dims,
        'measures': measures,
    }


def _first_dim(columns: list[dict], semantic_type: str | None = None) -> dict | None:
    for c in columns:
        if c.get('role') != 'dimension':
            continue
        if semantic_type is None or c.get('semantic_type') == semantic_type:
            return c
    return None


def _first_measure(columns: list[dict]) -> dict | None:
    for c in columns:
        if c.get('role') == 'measure':
            return c
    return None


def recommend_chart_spec(columns: list[dict]) -> dict:
    """Pick the best chart type for the given column profile and return
    a complete ChartSpec dict.

    Args:
        columns: List of column profile dicts (from profile_columns()).

    Returns:
        A ChartSpec dict with $schema, type, mark, and encoding populated.
        Missing channels are omitted entirely (never emitted as null) to
        satisfy the frontend chartSpecSchema which rejects null FieldRefs.
    """
    shape = _analyze_shape(columns)

    # Geo dominates
    if shape['has_geo']:
        geo_dim = _first_dim(columns, 'geographic')
        return {
            '$schema': 'askdb/chart-spec/v1',
            'type': 'map',
            'map': {
                'provider': 'maplibre',
                'style': 'osm-bright',
                'center': [0, 0],
                'zoom': 2,
                'layers': [
                    {'type': 'circle', 'source': 'data',
                     'paint': {'circle-radius': 4}},
                ] if geo_dim else [],
            },
        }

    # Temporal + measure → line
    if shape['has_date'] and shape['n_measures'] >= 1:
        date = _first_dim(columns, 'temporal')
        measure = _first_measure(columns)
        encoding: dict = {}
        if date is not None:
            encoding['x'] = {'field': date['name'], 'type': 'temporal'}
        if measure is not None:
            encoding['y'] = {
                'field': measure['name'],
                'type': 'quantitative',
                'aggregate': 'sum',
            }
        return {
            '$schema': 'askdb/chart-spec/v1',
            'type': 'cartesian',
            'mark': 'line',
            'encoding': encoding,
        }

    # 2 measures + 0 dims → scatter
    if shape['n_dims'] == 0 and shape['n_measures'] >= 2:
        m = shape['measures']
        return {
            '$schema': 'askdb/chart-spec/v1',
            'type': 'cartesian',
            'mark': 'point',
            'encoding': {
                'x': {'field': m[0]['name'], 'type': 'quantitative'},
                'y': {'field': m[1]['name'], 'type': 'quantitative'},
            },
        }

    # Default: nominal dim + measure → bar
    dim = _first_dim(columns, 'nominal') or _first_dim(columns)
    measure = _first_measure(columns)
    encoding: dict = {}
    if dim is not None:
        encoding['x'] = {'field': dim['name'], 'type': dim['semantic_type']}
    if measure is not None:
        encoding['y'] = {
            'field': measure['name'],
            'type': 'quantitative',
            'aggregate': 'sum',
        }
    return {
        '$schema': 'askdb/chart-spec/v1',
        'type': 'cartesian',
        'mark': 'bar',
        'encoding': encoding,
    }
