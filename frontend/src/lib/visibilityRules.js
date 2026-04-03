/**
 * Evaluate whether a section should be visible based on its visibility rule
 * and the current filter state.
 *
 * @param {object|null} rule - e.g. { type: "filter-value", field: "region", operator: "===", value: "North America" }
 * @param {object} globalFilters - { dateColumn, range, fields: [{column, operator, value}] }
 * @param {object|null} crossFilter - { field, value }
 * @returns {boolean}
 */
export function evaluateVisibilityRule(rule, globalFilters, crossFilter) {
  if (!rule) return true; // No rule = always visible

  const { type, field, operator, value } = rule;

  if (type === 'filter-value') {
    // Check crossFilter first
    if (crossFilter?.field === field) {
      return matchValue(crossFilter.value, operator, value);
    }
    // Check globalFilters.fields
    const filterMatch = (globalFilters?.fields || []).find(f => f.column === field);
    if (filterMatch) {
      return matchValue(filterMatch.value, operator, value);
    }
    // No matching filter active = hide (rule requires a specific filter)
    return false;
  }

  if (type === 'filter-exists') {
    // Visible when the specified field has ANY active filter
    if (crossFilter?.field === field) return true;
    return (globalFilters?.fields || []).some(f => f.column === field);
  }

  if (type === 'always') return true;

  return true; // Unknown type = visible
}

function matchValue(actual, operator, expected) {
  const a = String(actual);
  const e = String(expected);
  switch (operator) {
    case '===': return a === e;
    case '!==': return a !== e;
    case 'includes': return a.includes(e);
    default: return a === e;
  }
}
