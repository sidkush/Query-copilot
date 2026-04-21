import React from 'react';
import MonacoEditor from '@monaco-editor/react';
import {
  registerAskdbCalcLanguage,
  registerCalcProviders,
  ASKDB_CALC_LANGUAGE_ID,
} from '../lib/calcLanguage';
import { buildDiagnosticsRunner } from '../lib/calcDiagnostics';
import { CALC_FUNCTIONS } from '../lib/calcFunctionCatalogue';
import { validateCalc } from '../../../../api';
import { CalcTestValues } from './CalcTestValues';
import { CalcResultPreview } from './CalcResultPreview';
import { CalcDebugPanel } from './CalcDebugPanel';
import { CalcSuggestDialog } from './CalcSuggestDialog';
import './CalcEditorDialog.css';

function genId() {
  return 'calc_' + Math.random().toString(36).slice(2, 10);
}

/* Workbench-archetype calc editor. Shell redesigned 2026-04-21:
   dense IDE chrome, right-side Fields + Functions reference panel
   with click-to-insert at the cursor, visible close X, explicit
   keyboard-shortcut hints in the title bar. Contract preserved:
   `role="dialog"` + aria-modal, label "calculation name", Esc/Cmd+Enter,
   `data-testid="monaco-editor"` + `data-testid="mark-ai-generated"`. */
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
  const [sampleRows, setSampleRows] = React.useState([]);
  const [suggestOpen, setSuggestOpen] = React.useState(false);
  const [sidebarTab, setSidebarTab] = React.useState('fields');
  const [sidebarQuery, setSidebarQuery] = React.useState('');

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

  const stateRef = React.useRef({ name, formula, aiGenerated, initialCalc });
  // ref forwarded to non-react handlers; intentional render-time read
  // eslint-disable-next-line react-hooks/refs
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

  /* Insert a snippet at the current cursor. When the Monaco editor is
     mounted (production) we use executeEdits so undo groups correctly;
     under test the editor is a textarea mock so we fall back to
     appending to the formula state. `cursorShift` positions the caret
     inside parens for function templates. */
  function insertAtCursor(snippet, cursorShift = 0) {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (editor && monaco && typeof editor.executeEdits === 'function') {
      const sel = editor.getSelection() ?? new monaco.Range(1, 1, 1, 1);
      editor.executeEdits('calc-sidebar-insert', [
        { range: sel, text: snippet, forceMoveMarkers: true },
      ]);
      if (cursorShift) {
        const pos = editor.getPosition();
        if (pos) {
          editor.setPosition(new monaco.Position(pos.lineNumber, pos.column + cursorShift));
        }
      }
      editor.focus();
    } else {
      setFormula((prev) => prev + snippet);
    }
  }

  function onBackdropClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  /* Sidebar data: fields list + function groups. Filtered by query. */
  const filteredFields = React.useMemo(() => {
    const q = sidebarQuery.trim().toLowerCase();
    const all = (schemaFields ?? [])
      .concat((parameters ?? []).map((p) => ({ ...p, __param: true })))
      .concat((sets ?? []).map((s) => ({ ...s, __set: true, dataType: 'set' })));
    if (!q) return all;
    return all.filter((f) => f.name.toLowerCase().includes(q));
  }, [schemaFields, parameters, sets, sidebarQuery]);

  const functionGroups = React.useMemo(() => {
    const q = sidebarQuery.trim().toLowerCase();
    const groups = new Map();
    for (const fn of CALC_FUNCTIONS) {
      if (q && !fn.name.toLowerCase().includes(q)) continue;
      if (!groups.has(fn.category)) groups.set(fn.category, []);
      groups.get(fn.category).push(fn);
    }
    return Array.from(groups.entries());
  }, [sidebarQuery]);

  const fieldCount = (schemaFields?.length ?? 0) + (parameters?.length ?? 0) + (sets?.length ?? 0);
  const fnCount = CALC_FUNCTIONS.length;

  return (
    <div
      className="calc-editor-backdrop"
      onMouseDown={onBackdropClick}
      data-testid="calc-editor-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="calc-editor-title"
        className="calc-editor-dialog"
      >
        <header className="calc-editor-dialog__header">
          <h2 id="calc-editor-title" className="calc-editor-dialog__title">
            Calculation <strong style={{ color: 'var(--fg)', fontSize: 13, fontWeight: 600, letterSpacing: 0, textTransform: 'none' }}>Editor</strong>
          </h2>
          <div className="calc-editor-dialog__kbd-hints" aria-hidden="true">
            <span><kbd>⌘</kbd><kbd>↵</kbd> Save</span>
            <span><kbd>Esc</kbd> Close</span>
            <span><kbd>⌃</kbd><kbd>Space</kbd> Suggest</span>
          </div>
          <button
            type="button"
            className="calc-editor-dialog__close"
            aria-label="Close calculation editor"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div className="calc-editor-dialog__body">
          <div className="calc-editor-dialog__main">
            <div className="calc-editor-dialog__name-row">
              <label>
                <span>Calculation name</span>
                <input
                  aria-label="calculation name"
                  placeholder="e.g. Profit Margin"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {aiGenerated && (
                  <span className="calc-editor-dialog__ai-pill">AI-generated</span>
                )}
                <button
                  type="button"
                  className="calc-editor-dialog__btn calc-editor-dialog__btn--ghost"
                  onClick={() => setSuggestOpen(true)}
                >
                  Suggest with AI
                </button>
                {/* hidden test-only affordance to flip aiGenerated without opening sub-dialog */}
                <button
                  type="button"
                  data-testid="mark-ai-generated"
                  style={{ display: 'none' }}
                  onClick={() => setAiGenerated(true)}
                />
              </div>
            </div>

            <div className="calc-editor-dialog__editor-wrap">
              <span className="calc-editor-dialog__editor-hint">⌃ Space for suggestions</span>
              <MonacoEditor
                height="100%"
                language={ASKDB_CALC_LANGUAGE_ID}
                theme="askdb-calc-theme"
                value={formula}
                onChange={(v) => setFormula(v ?? '')}
                onMount={handleEditorMount}
                options={{
                  minimap: { enabled: false },
                  automaticLayout: true,
                  wordWrap: 'on',
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  fontSize: 13,
                  lineNumbersMinChars: 3,
                  folding: false,
                  scrollBeyondLastLine: false,
                  padding: { top: 12, bottom: 12 },
                }}
              />
            </div>

            <section className="calc-editor-dialog__bottom">
              <CalcTestValues
                connId={connId}
                selectedRowIdx={selectedRowIdx}
                onSelectRow={(i, rowData) => {
                  setSelectedRowIdx(i);
                  /* Evaluator consumes {column: value} — not just the index.
                     Keep __idx for legacy callers that key on it. */
                  setSampleRow({ ...(rowData ?? {}), __idx: i });
                }}
                onRowsLoaded={setSampleRows}
              />
              <CalcResultPreview
                formula={formula}
                row={sampleRow}
                rows={sampleRows}
                schemaRef={schemaRef}
                selectedRowIdx={selectedRowIdx}
              />
              <CalcDebugPanel
                formula={formula}
                row={sampleRow}
                schemaRef={schemaRef}
                selectedRowIdx={selectedRowIdx}
              />
            </section>
          </div>

          <aside className="calc-editor-dialog__sidebar" aria-label="Reference panel">
            <div className="calc-editor-dialog__sidebar-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={sidebarTab === 'fields'}
                className="calc-editor-dialog__sidebar-tab"
                onClick={() => setSidebarTab('fields')}
              >
                Fields
                <span className="calc-editor-dialog__sidebar-tab-count">{fieldCount}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sidebarTab === 'functions'}
                className="calc-editor-dialog__sidebar-tab"
                onClick={() => setSidebarTab('functions')}
              >
                Functions
                <span className="calc-editor-dialog__sidebar-tab-count">{fnCount}</span>
              </button>
            </div>

            <div className="calc-editor-dialog__sidebar-search">
              <input
                type="search"
                placeholder={sidebarTab === 'fields' ? 'Search columns…' : 'Search functions…'}
                value={sidebarQuery}
                onChange={(e) => setSidebarQuery(e.target.value)}
                aria-label={`Search ${sidebarTab}`}
              />
            </div>

            {sidebarTab === 'fields' && (
              <div className="calc-editor-dialog__sidebar-help">
                Click a column to insert <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>[Name]</code> at the cursor.
              </div>
            )}
            {sidebarTab === 'functions' && (
              <div className="calc-editor-dialog__sidebar-help">
                Click to insert a function call. Hover in the editor for docs.
              </div>
            )}

            <ul className="calc-editor-dialog__sidebar-list" role="listbox">
              {sidebarTab === 'fields' &&
                (filteredFields.length === 0 ? (
                  <li className="calc-editor-dialog__sidebar-empty">
                    {(schemaFields?.length ?? 0) === 0
                      ? 'Connect a data source to see columns.'
                      : 'No matches.'}
                  </li>
                ) : (
                  filteredFields.map((f) => (
                    <li key={(f.__param ? 'p:' : f.__set ? 's:' : 'f:') + f.name}>
                      <button
                        type="button"
                        className="calc-editor-dialog__sidebar-item"
                        onClick={() => insertAtCursor(`[${f.name}]`)}
                        title={`Insert [${f.name}]`}
                      >
                        <span className="calc-editor-dialog__sidebar-item-name">
                          {f.__param ? '⟐ ' : f.__set ? '⊂ ' : ''}{f.name}
                        </span>
                        <span className="calc-editor-dialog__sidebar-item-type">
                          {f.dataType ?? 'any'}
                        </span>
                      </button>
                    </li>
                  ))
                ))}

              {sidebarTab === 'functions' &&
                (functionGroups.length === 0 ? (
                  <li className="calc-editor-dialog__sidebar-empty">No matches.</li>
                ) : (
                  functionGroups.map(([cat, fns]) => (
                    <React.Fragment key={cat}>
                      <li className="calc-editor-dialog__sidebar-group" role="presentation">
                        {cat}
                      </li>
                      {fns.map((fn) => (
                        <li key={fn.name}>
                          <button
                            type="button"
                            className="calc-editor-dialog__sidebar-item"
                            onClick={() => insertAtCursor(`${fn.name}()`, -1)}
                            title={fn.signature + (fn.docstring ? ` — ${fn.docstring}` : '')}
                          >
                            <span className="calc-editor-dialog__sidebar-item-name">{fn.name}</span>
                            <span className="calc-editor-dialog__sidebar-item-type">
                              {fn.returnType ?? 'fn'}
                            </span>
                          </button>
                        </li>
                      ))}
                    </React.Fragment>
                  ))
                ))}
            </ul>
          </aside>
        </div>

        <footer className="calc-editor-dialog__footer">
          <div className="calc-editor-dialog__footer-left">
            {formula.trim().length === 0
              ? 'Start typing, or click a field on the right.'
              : `${formula.length} character${formula.length === 1 ? '' : 's'}`}
          </div>
          <button
            type="button"
            className="calc-editor-dialog__btn"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="calc-editor-dialog__btn calc-editor-dialog__btn--primary"
            onClick={doSaveClick}
          >
            Save
            <span className="calc-editor-dialog__btn-kbd">⌘↵</span>
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
    </div>
  );
}
