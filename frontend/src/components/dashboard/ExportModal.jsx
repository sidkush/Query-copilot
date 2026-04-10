import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TOKENS } from './tokens';

export default function ExportModal({ show, onClose, dashboardName, onExport }) {
  const [format, setFormat] = useState('pdf');
  const [mode, setMode] = useState('builder'); // 'builder' | 'presentation'
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  // Check if presentation slides exist (PresentationEngine is active)
  const hasPresentationSlides = () => !!document.getElementById('presentation-slide-0');

  const captureElement = async (html2canvas, target) => {
    return html2canvas(target, {
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-page').trim() || '#06060e',
      scale: 2,
      useCORS: true,
      logging: false,
      allowTaint: true,
      width: target.scrollWidth,
      height: target.scrollHeight,
    });
  };

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const html2canvas = (await import('html2canvas')).default;

      if (mode === 'presentation') {
        // Multi-slide presentation export
        const slideElements = [];
        let i = 0;
        while (true) {
          const slide = document.getElementById(`presentation-slide-${i}`);
          if (!slide) break;
          slideElements.push(slide);
          i++;
        }

        if (slideElements.length === 0) {
          setError('No presentation slides found. Enter fullscreen preview first.');
          return;
        }

        if (format === 'png') {
          // Export first slide as PNG
          const canvas = await captureElement(html2canvas, slideElements[0]);
          const link = document.createElement('a');
          link.download = `${dashboardName || 'dashboard'}_slide1.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
        } else {
          // Multi-page PDF: one slide per page
          const { jsPDF } = await import('jspdf');
          const pxToMm = 0.264583;
          let pdf = null;

          for (let s = 0; s < slideElements.length; s++) {
            const canvas = await captureElement(html2canvas, slideElements[s]);
            const imgData = canvas.toDataURL('image/png');
            const widthMm = (canvas.width / 2) * pxToMm;
            const heightMm = (canvas.height / 2) * pxToMm;

            if (s === 0) {
              pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [widthMm, heightMm] });
            } else {
              pdf.addPage([widthMm, heightMm], 'landscape');
            }
            pdf.addImage(imgData, 'PNG', 0, 0, widthMm, heightMm);
          }
          pdf?.save(`${dashboardName || 'dashboard'}_presentation.pdf`);
        }
      } else {
        // Builder mode export (original behavior)
        const target = document.getElementById('dashboard-export-area')
          || document.getElementById('dashboard-content');
        if (!target) {
          setError('Dashboard content not found. Please try again.');
          return;
        }

        const origOverflow = target.style.overflowY;
        const origHeight = target.style.minHeight;
        const origMaxH = target.style.maxHeight;
        target.style.overflowY = 'visible';
        target.style.minHeight = 'auto';
        target.style.maxHeight = 'none';

        await new Promise(r => setTimeout(r, 100));

        const canvas = await html2canvas(target, {
          backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-page').trim() || '#06060e',
          scale: 2,
          useCORS: true,
          logging: false,
          allowTaint: true,
          width: target.scrollWidth,
          height: target.scrollHeight,
          scrollX: 0,
          scrollY: -window.scrollY,
        });

        target.style.overflowY = origOverflow;
        target.style.minHeight = origHeight;
        target.style.maxHeight = origMaxH;

        if (format === 'png') {
          const link = document.createElement('a');
          link.download = `${dashboardName || 'dashboard'}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
        } else {
          const { jsPDF } = await import('jspdf');
          const imgData = canvas.toDataURL('image/png');
          const pxToMm = 0.264583;
          const widthMm = (canvas.width / 2) * pxToMm;
          const heightMm = (canvas.height / 2) * pxToMm;
          const pdf = new jsPDF({
            orientation: widthMm > heightMm ? 'landscape' : 'portrait',
            unit: 'mm',
            format: [widthMm, heightMm],
          });
          pdf.addImage(imgData, 'PNG', 0, 0, widthMm, heightMm);
          pdf.save(`${dashboardName || 'dashboard'}.pdf`);
        }
      }

      onExport?.();
      onClose?.();
    } catch (err) {
      console.error('Export failed:', err);
      setError('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={onClose}/>
          <motion.div className="relative rounded-2xl p-6 w-full max-w-sm"
            style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}` }}
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}>
            <h3 className="text-base font-semibold mb-4" style={{ color: TOKENS.text.primary }}>Export Dashboard</h3>

            {/* Export mode toggle */}
            <div className="flex gap-2 mb-4">
              {[
                { id: 'builder', label: 'Builder View' },
                { id: 'presentation', label: 'Presentation' },
              ].map(m => (
                <button key={m.id} onClick={() => setMode(m.id)}
                  className="flex-1 py-2 rounded-lg text-xs font-medium cursor-pointer"
                  style={{
                    background: mode === m.id ? TOKENS.accentGlow : TOKENS.bg.surface,
                    border: `1px solid ${mode === m.id ? TOKENS.accent : TOKENS.border.default}`,
                    color: mode === m.id ? TOKENS.accent : TOKENS.text.muted,
                  }}>
                  {m.label}
                </button>
              ))}
            </div>
            {mode === 'presentation' && (
              <p className="text-[11px] mb-3" style={{ color: TOKENS.text.muted }}>
                {format === 'pdf' ? 'Multi-page PDF — one slide per page' : 'Exports current slide as PNG'}.
                Enter Preview mode first for best results.
              </p>
            )}

            {/* Format toggle */}
            <div className="flex gap-3 mb-6">
              {['pdf', 'png'].map(f => (
                <button key={f} onClick={() => setFormat(f)}
                  className="flex-1 py-3 rounded-xl text-sm font-medium cursor-pointer"
                  style={{
                    background: format === f ? TOKENS.accentGlow : TOKENS.bg.surface,
                    border: `1px solid ${format === f ? TOKENS.accent : TOKENS.border.default}`,
                    color: format === f ? TOKENS.accentLight : TOKENS.text.secondary,
                  }}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            {error && (
              <p className="text-xs mb-3" style={{ color: TOKENS.danger }}>{error}</p>
            )}
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
                style={{ background: TOKENS.bg.surface, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.secondary }}>
                Cancel
              </button>
              <button onClick={handleExport} disabled={exporting}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
                style={{ background: TOKENS.accent, color: 'white', opacity: exporting ? 0.6 : 1 }}>
                {exporting ? 'Exporting...' : 'Export'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
