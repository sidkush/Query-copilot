import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { TOKENS } from './tokens';
import { getFieldSuggestions, classifyColumns } from '../../lib/fieldClassification';

/**
 * Scan backward from cursorPos in text to detect an enclosing SQL function.
 * E.g. in "SUM({", scanning back from position 5 finds "(" at 3, then "SUM".
 * Returns the function name uppercased, or null.
 */
function detectEnclosingFunction(text, cursorPos) {
  let i = cursorPos - 1;

  // Walk back past any whitespace and the `{` trigger character
  while (i >= 0 && (text[i] === '{' || text[i] === ' ')) {
    i--;
  }

  // We need to find a `(` character
  if (i < 0 || text[i] !== '(') {
    return null;
  }

  // Move past the `(`
  i--;

  // Skip trailing whitespace between function name and paren
  while (i >= 0 && text[i] === ' ') {
    i--;
  }

  // Collect the function name (alphanumeric + underscore)
  let end = i;
  while (i >= 0 && /[a-zA-Z0-9_]/.test(text[i])) {
    i--;
  }

  const name = text.slice(i + 1, end + 1).trim();
  return name.length > 0 ? name.toUpperCase() : null;
}

const styles = {
  wrapper: {
    position: 'relative',
    width: '100%',
  },
  textarea: {
    width: '100%',
    minHeight: 80,
    padding: '10px 12px',
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    lineHeight: 1.5,
    color: TOKENS.text.primary,
    background: TOKENS.bg.elevated,
    border: `1px solid ${TOKENS.border.default}`,
    borderRadius: TOKENS.radius.sm,
    outline: 'none',
    resize: 'vertical',
    transition: TOKENS.transition,
    boxSizing: 'border-box',
  },
  textareaFocused: {
    borderColor: TOKENS.border.hover,
    boxShadow: `0 0 0 2px ${TOKENS.accentGlow}`,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    maxHeight: 200,
    overflowY: 'auto',
    background: TOKENS.bg.surface,
    border: `1px solid ${TOKENS.border.default}`,
    borderRadius: TOKENS.radius.sm,
    zIndex: 50,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  },
  filterBar: {
    padding: '6px 10px',
    fontSize: 11,
    color: TOKENS.text.muted,
    borderBottom: `1px solid ${TOKENS.border.default}`,
    fontStyle: 'italic',
  },
  sectionHeader: {
    padding: '6px 10px',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    userSelect: 'none',
  },
  sectionHeaderMeasure: {
    color: TOKENS.success,
  },
  sectionHeaderDimension: {
    color: TOKENS.accentLight,
  },
  item: {
    padding: '5px 10px 5px 18px',
    fontSize: 12,
    color: TOKENS.text.secondary,
    cursor: 'pointer',
    transition: TOKENS.transition,
  },
  itemHover: {
    background: TOKENS.bg.hover,
    color: TOKENS.text.primary,
  },
  itemSelected: {
    background: TOKENS.accentGlow,
    color: TOKENS.text.primary,
  },
  emptyMsg: {
    padding: '10px',
    fontSize: 12,
    color: TOKENS.text.muted,
    textAlign: 'center',
  },
};

export default function FormulaInput({
  value = '',
  onChange,
  schemaColumns = [],
  fieldClassifications = {},
  sampleColumns = [],
  placeholder = 'e.g. SUM({revenue}) / COUNT({order_id})',
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownFilter, setDropdownFilter] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [triggerPos, setTriggerPos] = useState(null);
  const [isFocused, setIsFocused] = useState(false);

  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);

  // Effective classifications: merge explicit props + auto-classify from schemaColumns + sampleColumns fallback
  const effectiveClassifications = useMemo(() => {
    // Start with provided classifications
    const base = { ...fieldClassifications };
    const hasExplicit = Object.keys(base).length > 0;

    // If schemaColumns available but classifications are empty, auto-classify from schema types
    if (!hasExplicit && schemaColumns.length > 0) {
      const auto = classifyColumns(schemaColumns, [], {});
      Object.assign(base, auto);
    }

    // Also add any sampleColumns not yet in base (fallback from tile data)
    for (const col of sampleColumns) {
      if (col && !base[col]) {
        base[col] = 'dimension'; // safe default for columns from tile data with no type info
      }
    }

    return base;
  }, [fieldClassifications, schemaColumns, sampleColumns]);

  // Build the flat list of dropdown items grouped by section
  const buildDropdownItems = useCallback(() => {
    const funcName = triggerPos != null
      ? detectEnclosingFunction(value, triggerPos)
      : null;

    const { dimensions, measures, preferred } = getFieldSuggestions(
      funcName,
      effectiveClassifications
    );

    const filterLower = dropdownFilter.toLowerCase();

    const filteredDimensions = dimensions.filter(
      (col) => col.toLowerCase().includes(filterLower)
    );
    const filteredMeasures = measures.filter(
      (col) => col.toLowerCase().includes(filterLower)
    );

    // Build ordered sections: preferred type first
    const sections = [];

    if (preferred === 'dimension') {
      if (filteredDimensions.length > 0) {
        sections.push({ type: 'dimension', header: 'Dimensions', items: filteredDimensions });
      }
      if (filteredMeasures.length > 0) {
        sections.push({ type: 'measure', header: 'Measures', items: filteredMeasures });
      }
    } else {
      // 'measure' or 'all' — measures first
      if (filteredMeasures.length > 0) {
        sections.push({ type: 'measure', header: 'Measures', items: filteredMeasures });
      }
      if (filteredDimensions.length > 0) {
        sections.push({ type: 'dimension', header: 'Dimensions', items: filteredDimensions });
      }
    }

    // Flatten to a single list with section markers for rendering
    const flat = [];
    for (const section of sections) {
      flat.push({ kind: 'header', type: section.type, label: section.header });
      for (const col of section.items) {
        flat.push({ kind: 'item', type: section.type, name: col });
      }
    }

    return flat;
  }, [value, triggerPos, effectiveClassifications, dropdownFilter]);

  const dropdownItems = showDropdown ? buildDropdownItems() : [];
  const selectableItems = dropdownItems.filter((d) => d.kind === 'item');

  // Clamp selectedIndex when the list changes
  useEffect(() => {
    if (selectedIndex >= selectableItems.length) {
      setSelectedIndex(Math.max(0, selectableItems.length - 1));
    }
  }, [selectableItems.length, selectedIndex]);

  // Scroll the selected item into view
  useEffect(() => {
    if (!showDropdown || !dropdownRef.current) return;
    const container = dropdownRef.current;
    const selectedEl = container.querySelector('[data-selected="true"]');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, showDropdown]);

  const closeDropdown = useCallback(() => {
    setShowDropdown(false);
    setDropdownFilter('');
    setSelectedIndex(0);
    setTriggerPos(null);
  }, []);

  const insertColumn = useCallback(
    (colName) => {
      if (triggerPos == null) return;

      const ta = textareaRef.current;
      const cursor = ta ? ta.selectionStart : triggerPos;

      // Replace from triggerPos-1 (the `{`) through cursor with `{colName}`
      const before = value.slice(0, triggerPos - 1);
      const after = value.slice(cursor);
      const inserted = `{${colName}}`;
      const newValue = before + inserted + after;

      onChange(newValue);
      closeDropdown();

      // Restore cursor after the inserted text
      requestAnimationFrame(() => {
        if (ta) {
          const newCursor = before.length + inserted.length;
          ta.setSelectionRange(newCursor, newCursor);
          ta.focus();
        }
      });
    },
    [value, onChange, triggerPos, closeDropdown]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === '{' && !showDropdown) {
        // The { character hasn't been inserted into the value yet.
        // After the onChange fires, triggerPos will be selectionStart + 1
        // (right after the `{`).
        setShowDropdown(true);
        setTriggerPos(e.target.selectionStart + 1);
        setDropdownFilter('');
        setSelectedIndex(0);
        return;
      }

      if (!showDropdown) return;

      if (e.key === '}' || e.key === 'Escape') {
        closeDropdown();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < selectableItems.length - 1 ? prev + 1 : 0
        );
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : selectableItems.length - 1
        );
        return;
      }

      if (e.key === 'Enter' && selectableItems.length > 0) {
        e.preventDefault();
        const item = selectableItems[selectedIndex];
        if (item) {
          insertColumn(item.name);
        }
        return;
      }

      if (e.key === 'Tab' && selectableItems.length > 0) {
        e.preventDefault();
        const item = selectableItems[selectedIndex];
        if (item) {
          insertColumn(item.name);
        }
        return;
      }
    },
    [showDropdown, closeDropdown, selectableItems, selectedIndex, insertColumn]
  );

  const handleChange = useCallback(
    (e) => {
      const newValue = e.target.value;
      onChange(newValue);

      if (showDropdown && triggerPos != null) {
        const cursor = e.target.selectionStart;
        if (cursor < triggerPos) {
          // Cursor moved before the trigger — close
          closeDropdown();
        } else {
          const filterText = newValue.slice(triggerPos, cursor);
          setDropdownFilter(filterText);
          setSelectedIndex(0);
        }
      }
    },
    [onChange, showDropdown, triggerPos, closeDropdown]
  );

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;

    const handleClickOutside = (e) => {
      if (
        textareaRef.current &&
        !textareaRef.current.contains(e.target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target)
      ) {
        closeDropdown();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown, closeDropdown]);

  // Track which item index we are rendering in the selectable-only list
  let selectableIdx = -1;

  return (
    <div style={styles.wrapper}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        spellCheck={false}
        style={{
          ...styles.textarea,
          ...(isFocused ? styles.textareaFocused : {}),
        }}
      />

      {showDropdown && (
        <div ref={dropdownRef} style={styles.dropdown}>
          {dropdownFilter && (
            <div style={styles.filterBar}>
              Filtering: <strong>{dropdownFilter}</strong>
            </div>
          )}

          {selectableItems.length === 0 ? (
            <div style={styles.emptyMsg}>No matching columns</div>
          ) : (
            dropdownItems.map((entry, i) => {
              if (entry.kind === 'header') {
                const headerColor =
                  entry.type === 'measure'
                    ? styles.sectionHeaderMeasure
                    : styles.sectionHeaderDimension;

                return (
                  <div
                    key={`header-${entry.type}-${i}`}
                    style={{ ...styles.sectionHeader, ...headerColor }}
                  >
                    {entry.label}
                  </div>
                );
              }

              selectableIdx++;
              const isSelected = selectableIdx === selectedIndex;

              return (
                <ItemRow
                  key={`item-${entry.name}-${i}`}
                  name={entry.name}
                  isSelected={isSelected}
                  onSelect={() => insertColumn(entry.name)}
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Individual dropdown item with hover and selected state.
 */
function ItemRow({ name, isSelected, onSelect }) {
  const [hovered, setHovered] = useState(false);

  const computedStyle = {
    ...styles.item,
    ...(isSelected ? styles.itemSelected : {}),
    ...(hovered && !isSelected ? styles.itemHover : {}),
  };

  return (
    <div
      data-selected={isSelected ? 'true' : undefined}
      style={computedStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={(e) => {
        e.preventDefault(); // Prevent textarea blur
        onSelect();
      }}
    >
      {name}
    </div>
  );
}
