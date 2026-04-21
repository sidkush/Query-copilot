// frontend/src/components/dashboard/freeform/FloatingLayer.jsx
import { memo, useMemo } from 'react';
import { evaluateRule, buildEvaluationContext } from './lib/visibilityRules';
import { useStore } from '../../../store';
import ReferenceLineDialog from './panels/ReferenceLineDialog';
import TrendLineDialog from './panels/TrendLineDialog';
import ForecastDialog from './panels/ForecastDialog';
import ClusterDialog from './panels/ClusterDialog';
import BoxPlotDialog from './panels/BoxPlotDialog';
import DropLinesDialog from './panels/DropLinesDialog';

const EMPTY_SETS = Object.freeze([]);
const EMPTY_PARAMS = Object.freeze([]);
const EMPTY_FILTERS = Object.freeze({});

/**
 * Renders the floating layer of a freeform dashboard.
 * Plan 4d: floating zones with a falsy visibilityRule are filtered out
 * before sort/render — no DOM, no pointer-event surface.
 *
 * Plan 9a T10: also mounts `ReferenceLineDialog` when the
 * `analystProReferenceLineDialog` store slice is non-null — mirrors the
 * `CalcEditorDialog` wiring pattern (Plan 8d T11, commit bbca582).
 */
function FloatingLayer({ zones, renderLeaf }) {
  const sets = useStore((s) => s.analystProDashboard?.sets ?? EMPTY_SETS);
  const parameters = useStore((s) => s.analystProDashboard?.parameters ?? EMPTY_PARAMS);
  const sheetFilters = useStore((s) => s.analystProSheetFilters ?? EMPTY_FILTERS);
  const analystProReferenceLineDialog = useStore((s) => s.analystProReferenceLineDialog);
  const analystProTrendLineDialogCtx = useStore((s) => s.analystProTrendLineDialogCtx);
  const analystProForecastDialogCtx = useStore((s) => s.analystProForecastDialogCtx);
  const analystProClusterDialogCtx = useStore((s) => s.analystProClusterDialogCtx);
  const analystProBoxPlotDialogCtx = useStore((s) => s.analystProBoxPlotDialogCtx);
  const analystProDropLinesDialogCtx = useStore((s) => s.analystProDropLinesDialogCtx);
  const ctx = useMemo(
    () => buildEvaluationContext({ sets, parameters, sheetFilters }),
    [sets, parameters, sheetFilters],
  );

  const dialogNode = (
    <>
      {analystProReferenceLineDialog ? <ReferenceLineDialog /> : null}
      {analystProTrendLineDialogCtx ? <TrendLineDialog /> : null}
      {analystProForecastDialogCtx ? <ForecastDialog /> : null}
      {analystProClusterDialogCtx ? <ClusterDialog /> : null}
      {analystProBoxPlotDialogCtx ? <BoxPlotDialog /> : null}
      {analystProDropLinesDialogCtx ? <DropLinesDialog /> : null}
    </>
  );

  if (!zones || zones.length === 0) {
    return dialogNode;
  }
  const visible = zones.filter((z) => evaluateRule(z.visibilityRule, ctx));
  if (visible.length === 0) {
    return dialogNode;
  }
  const sorted = [...visible].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  return (
    <>
      <div
        data-testid="floating-layer"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        {sorted.map((zone) => (
          <div
            key={zone.id}
            data-testid={`floating-zone-${zone.id}`}
            data-zone-type={zone.type}
            style={{
              position: 'absolute',
              left: zone.x,
              top: zone.y,
              width: zone.pxW,
              height: zone.pxH,
              zIndex: zone.zIndex ?? 0,
              pointerEvents: 'auto',
            }}
          >
            {renderLeaf(zone)}
          </div>
        ))}
      </div>
      {dialogNode}
    </>
  );
}

export default memo(FloatingLayer);
