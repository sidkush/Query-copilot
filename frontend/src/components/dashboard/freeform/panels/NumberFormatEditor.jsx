// Plan 10b — Number format editor. Mounted inside FormatInspectorPanel.
// Lets the user pick a named default or type a custom Excel-style pattern.
// Live-previews against 1,234,567.89 and shows error indicator for bad patterns.
import React, { useMemo } from 'react';

import {
  formatNumber,
  NumberFormatError,
  parseNumberFormat,
} from '../lib/numberFormat';
import { DEFAULT_NUMBER_FORMATS } from '../lib/numberFormatDefaults';

import styles from './NumberFormatEditor.module.css';

const SAMPLE_VALUE = 1234567.89;
const CUSTOM_LABEL = 'Custom';

export default function NumberFormatEditor({ value, onChange }) {
  const matchedPreset = useMemo(() => {
    const hit = DEFAULT_NUMBER_FORMATS.find((d) => d.pattern === value);
    return hit ? hit.name : CUSTOM_LABEL;
  }, [value]);

  const { preview, error } = useMemo(() => {
    if (!value) return { preview: '', error: null };
    try {
      const ast = parseNumberFormat(value);
      return { preview: formatNumber(SAMPLE_VALUE, ast), error: null };
    } catch (e) {
      if (e instanceof NumberFormatError) return { preview: '', error: e.message };
      throw e;
    }
  }, [value]);

  const handlePreset = (e) => {
    const name = e.target.value;
    if (name === CUSTOM_LABEL) return;
    const hit = DEFAULT_NUMBER_FORMATS.find((d) => d.name === name);
    if (hit) onChange(hit.pattern);
  };

  const handleCustom = (e) => {
    onChange(e.target.value);
  };

  return (
    <div className={styles.editor}>
      <div className={styles.row}>
        <span className={styles.label}>Preset</span>
        <select
          data-testid="nfmt-preset"
          value={matchedPreset}
          onChange={handlePreset}
        >
          <option value={CUSTOM_LABEL}>{CUSTOM_LABEL}</option>
          {DEFAULT_NUMBER_FORMATS.map((d) => (
            <option key={d.name} value={d.name}>{d.name}</option>
          ))}
        </select>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Pattern</span>
        <input
          data-testid="nfmt-custom"
          type="text"
          value={value ?? ''}
          onChange={handleCustom}
          spellCheck={false}
        />
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Preview</span>
        <span data-testid="nfmt-preview" className={styles.preview}>
          {preview ? `Sample: ${preview}` : 'Sample: —'}
        </span>
      </div>
      {error && (
        <div data-testid="nfmt-error" className={styles.error}>{error}</div>
      )}
    </div>
  );
}
