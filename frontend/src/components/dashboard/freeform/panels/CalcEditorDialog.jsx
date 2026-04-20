import React from 'react';
import MonacoEditor from '@monaco-editor/react';
import {
  registerAskdbCalcLanguage,
  registerCalcProviders,
  ASKDB_CALC_LANGUAGE_ID,
} from '../lib/calcLanguage';
import { buildDiagnosticsRunner } from '../lib/calcDiagnostics';
import { validateCalc } from '../../../../api';
import { CalcTestValues } from './CalcTestValues';
import { CalcResultPreview } from './CalcResultPreview';
import { CalcDebugPanel } from './CalcDebugPanel';
import { CalcSuggestDialog } from './CalcSuggestDialog';

function genId() {
  return 'calc_' + Math.random().toString(36).slice(2, 10);
}

/**
 * Plan 8d T11 — CalcEditorDialog.
 *
 * Top-level modal that composes Monaco + CalcTestValues + CalcResultPreview
 * + CalcDebugPanel into a Tableau-style calculation authoring experience.
 *
 * Keyboard:
 *   - Esc             → onClose()
 *   - Cmd/Ctrl+Enter  → save
 *
 * LLM suggest flow:
 *   "Suggest with AI" opens `CalcSuggestDialog`. On Accept, the returned
 *   formula is written to the editor and `aiGenerated` is latched; the
 *   flag propagates into the saved calc as `is_generative_ai_web_authoring`.
 *
 * Props:
 *   connId         — active connection id (forwarded to CalcTestValues).
 *   schemaFields   — [{ name, dataType, sampleValues? }] used for completion / hover.
 *   parameters     — [{ name, dataType }] user-authored parameters.
 *   sets           — [{ name }] user-authored sets.
 *   existingCalcs  — [{ name, formula }] known calcs (de-dup hint for LLM).
 *   initialCalc    — optional { id, name, formula, is_generative_ai_web_authoring } for edit mode.
 *   onSave(calc)   — called with `{ id, name, formula, is_generative_ai_web_authoring }`.
 *   onClose()      — called on dismiss.
 */
export function CalcEditorDialog({
  connId,
  schemaFields,
  parameters,
  sets,
  existingCalcs,
  initialCalc,
  onSave,
  onClose,
}) {
  const [name, setName] = React.useState(initialCalc?.name ?? '');
  const [formula, setFormula] = React.useState(initialCalc?.formula ?? '');
  const [aiGenerated, setAiGenerated] = React.useState(
    Boolean(initialCalc?.is_generative_ai_web_authoring),
  );
  const [selectedRowIdx, setSelectedRowIdx] = React.useState(0);
  const [sampleRow, setSampleRow] = React.useState({});
  const [suggestOpen, setSuggestOpen] = React.useState(false);

  const editorRef = React.useRef(null);
  const monacoRef = React.useRef(null);
  const disposeRef = React.useRef(null);
  const diagRef = React.useRef(null);

  const schemaRef = React.useMemo(
    () => Object.fromEntries((schemaFields ?? []).map((f) => [f.name, f.dataType])),
    [schemaFields],
  );

  function handleEditorMount(editor, monaco) {
    editorRef.current = editor;
    monacoRef.current = monaco;
    registerAskdbCalcLanguage(monaco);
    disposeRef.current = registerCalcProviders(monaco, {
      schemaFields: schemaFields ?? [],
      parameters: parameters ?? [],
      sets: sets ?? [],
    }).dispose;
    diagRef.current = buildDiagnosticsRunner({
      validateCalc,
      schemaRef,
      schemaStats: {},
      onMarkers: (markers) => {
        const model = editor.getModel?.();
        if (model) monaco.editor.setModelMarkers(model, 'askdb-calc', markers);
      },
    });
  }

  React.useEffect(
    () => () => {
      if (disposeRef.current) disposeRef.current();
      if (diagRef.current) diagRef.current.dispose();
    },
    [],
  );

  React.useEffect(() => {
    diagRef.current?.update(formula);
  }, [formula]);

  // Latest-values ref so the global keydown handler always sees fresh state
  // without re-binding the listener on every keystroke.
  const stateRef = React.useRef({ name, formula, aiGenerated, initialCalc });
  stateRef.current = { name, formula, aiGenerated, initialCalc };

  React.useEffect(() => {
    function doSave() {
      const s = stateRef.current;
      onSave({
        id: s.initialCalc?.id ?? genId(),
        name: s.name || 'New calculation',
        formula: s.formula,
        is_generative_ai_web_authoring: s.aiGenerated,
      });
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        doSave();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onSave]);

  function doSaveClick() {
    onSave({
      id: initialCalc?.id ?? genId(),
      name: name || 'New calculation',
      formula,
      is_generative_ai_web_authoring: aiGenerated,
    });
  }

  function acceptSuggestion(res) {
    setFormula(res.formula);
    setAiGenerated(true);
    setSuggestOpen(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="calc-editor-title"
      className="calc-editor-dialog"
    >
      <header className="calc-editor-dialog__header">
        <h2 id="calc-editor-title">Calculation</h2>
        <label>
          <span>Calculation name</span>
          <input
            aria-label="calculation name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button type="button" onClick={() => setSuggestOpen(true)}>
          Suggest with AI
        </button>
        {/* test-only affordance — hidden from production users via CSS */}
        <button
          type="button"
          data-testid="mark-ai-generated"
          style={{ display: 'none' }}
          onClick={() => setAiGenerated(true)}
        />
      </header>
      <div className="calc-editor-dialog__body">
        <MonacoEditor
          height="40vh"
          language={ASKDB_CALC_LANGUAGE_ID}
          theme="askdb-calc-theme"
          value={formula}
          onChange={(v) => setFormula(v ?? '')}
          onMount={handleEditorMount}
          options={{ minimap: { enabled: false }, automaticLayout: true, wordWrap: 'on' }}
        />
        <section className="calc-editor-dialog__bottom">
          <CalcTestValues
            connId={connId}
            selectedRowIdx={selectedRowIdx}
            onSelectRow={(i) => {
              setSelectedRowIdx(i);
              setSampleRow({ ...sampleRow, __idx: i });
            }}
          />
          <CalcResultPreview formula={formula} row={sampleRow} schemaRef={schemaRef} />
          <CalcDebugPanel formula={formula} row={sampleRow} schemaRef={schemaRef} />
        </section>
      </div>
      <footer className="calc-editor-dialog__footer">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" onClick={doSaveClick}>
          Save
        </button>
      </footer>
      {suggestOpen && (
        <CalcSuggestDialog
          schemaRef={schemaRef}
          parameters={parameters ?? []}
          sets={sets ?? []}
          existingCalcs={existingCalcs ?? []}
          onAccept={acceptSuggestion}
          onClose={() => setSuggestOpen(false)}
        />
      )}
    </div>
  );
}
