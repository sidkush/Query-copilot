# Phase 2: Innovation Features — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cross-tile interactivity, state bookmarking, dynamic zone visibility, and chart crossfade animation.

**Architecture:** Cross-filter as DashboardBuilder state passed through props. Bookmarks as dashboard.bookmarks[] with URL params. DZV as section.visibilityRule evaluated before render. Crossfade via Framer Motion AnimatePresence.

**Tech Stack:** React 19, Zustand, Framer Motion (existing), React Router useSearchParams

---

### Task 1: Cross-Tile Interactivity

**Files:**
- Modify: `frontend/src/pages/DashboardBuilder.jsx` (add crossFilter state + handler)
- Modify: `frontend/src/components/ResultsChart.jsx` (add onClick to Bar/Pie, filter rows)
- Modify: `frontend/src/components/dashboard/TileWrapper.jsx` (pass crossFilter + onCrossFilter)
- Modify: `frontend/src/components/dashboard/Section.jsx` (thread props)
- Create: `frontend/src/components/dashboard/CrossFilterBadge.jsx` (shows active filter with clear button)

**DashboardBuilder changes:**
- Add state: `const [crossFilter, setCrossFilter] = useState(null);` — shape: `{ field, value, sourceTileId }`
- Add handler: `handleCrossFilterClick(field, value, sourceTileId)` — sets crossFilter state
- Add handler: `clearCrossFilter()` — sets crossFilter to null
- Pass `crossFilter` and `onCrossFilterClick` through Section → TileWrapper → ResultsChart
- Render `<CrossFilterBadge>` above the sections when crossFilter is active

**ResultsChart changes:**
- Accept new props: `crossFilter`, `onCrossFilterClick`
- Before rendering, filter data: `const chartData = crossFilter ? sortedData.filter(r => String(r[crossFilter.field]) === String(crossFilter.value)) : sortedData;`
- Add `onClick` to Bar component: `onClick={(data) => onCrossFilterClick?.(labelCol, data[labelCol], null)}`
- Add `onClick` to Pie Cell: `onClick={(data) => onCrossFilterClick?.(labelCol, data.name, null)}`
- Use `chartData` instead of `sortedData` for rendering

**CrossFilterBadge:** Shows "Filtered by {field} = {value}" with X clear button. Styled with TOKENS.

---

### Task 2: State Bookmarking

**Files:**
- Modify: `backend/user_storage.py` (add bookmarks to allowed keys + CRUD functions)
- Modify: `backend/routers/dashboard_routes.py` (add bookmark endpoints)
- Modify: `frontend/src/api.js` (add bookmark API functions)
- Modify: `frontend/src/pages/DashboardBuilder.jsx` (bookmark state, URL param parsing, save/load)
- Modify: `frontend/src/components/dashboard/DashboardHeader.jsx` (add Save View + bookmark dropdown)
- Create: `frontend/src/components/dashboard/BookmarkManager.jsx` (save modal + list)

**Backend:**
- Add `"bookmarks"` to allowed keys in `update_dashboard()` (line 505)
- Add CRUD functions: `save_bookmark()`, `list_bookmarks()`, `delete_bookmark()`
- Add routes: POST/GET/DELETE `/dashboards/{id}/bookmarks`

**Frontend:**
- DashboardBuilder reads `?view=bm_xyz` from URL on mount via `useSearchParams`
- If bookmark found, apply state overlay (activeTabId, globalFilters, crossFilter, collapsedSections)
- "Save View" button opens BookmarkManager modal
- BookmarkManager: name input + save button, list of existing bookmarks, share URL copy

**Bookmark state shape:**
```json
{ "id": "bm_xyz", "name": "Monday View", "state": { "activeTabId": "...", "globalFilters": {...}, "crossFilter": null }, "created_at": "..." }
```

---

### Task 3: Dynamic Zone Visibility

**Files:**
- Create: `frontend/src/lib/visibilityRules.js` (evaluateVisibilityRule function)
- Modify: `frontend/src/pages/DashboardBuilder.jsx` (filter sections before rendering)
- Modify: `frontend/src/components/dashboard/Section.jsx` (show "conditional" badge)

**Rule shape:** `section.visibilityRule = { type: "filter-value", field: "region", operator: "===", value: "North America" }`

**Evaluator:** Simple comparison engine (~30 lines):
```js
export function evaluateVisibilityRule(rule, globalFilters, crossFilter) {
  if (!rule) return true;
  // Check globalFilters.fields for matching field+value
  // Check crossFilter for matching field+value
  // Return true if rule condition met, false otherwise
}
```

**DashboardBuilder:** Before sections.map, filter: `sections.filter(s => evaluateVisibilityRule(s.visibilityRule, globalFilters, crossFilter))`

**Section:** Show badge when `section.visibilityRule` exists.

---

### Task 4: Chart Crossfade Animation

**Files:**
- Modify: `frontend/src/components/ResultsChart.jsx` (wrap renderChart in AnimatePresence)

**Simple change:** Wrap the chart render output in Framer Motion AnimatePresence:

```jsx
<AnimatePresence mode="wait">
  <motion.div key={chartType} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
    <ResponsiveContainer>{renderChart()}</ResponsiveContainer>
  </motion.div>
</AnimatePresence>
```

Framer Motion is already imported in ResultsChart (check imports). If not, add it.

---

### Task 5: Build verification

Full build + backend check.
