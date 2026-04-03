import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TOKENS } from './tokens';

export default function ExportModal({ show, onClose, dashboardName, onExport }) {
  const [format, setFormat] = useState('pdf');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const html2canvas = (await import('html2canvas')).default;

      // Capture the full main area (header + tabs + filters + charts)
      // Fall back to dashboard-content if main area not found
      const target = document.getElementById('dashboard-export-area')
        || document.getElementById('dashboard-content');
      if (!target) {
        setError('Dashboard content not found. Please try again.');
        return;
      }

      // Temporarily expand scrollable content so html2canvas captures everything
      const origOverflow = target.style.overflowY;
      const origHeight = target.style.minHeight;
      const origMaxH = target.style.maxHeight;
      target.style.overflowY = 'visible';
      target.style.minHeight = 'auto';
      target.style.maxHeight = 'none';

      // Wait a tick for layout to settle
      await new Promise(r => setTimeout(r, 100));

      const canvas = await html2canvas(target, {
        backgroundColor: '#06060e',
        scale: 2,
        useCORS: true,
        logging: false,
        allowTaint: true,
        width: target.scrollWidth,
        height: target.scrollHeight,
        scrollX: 0,
        scrollY: -window.scrollY,
      });

      // Restore original styles
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
        // Convert canvas pixels to mm (scale:2 means each CSS pixel = 2 canvas pixels)
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
