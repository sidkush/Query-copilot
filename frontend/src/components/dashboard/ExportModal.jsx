import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TOKENS } from './tokens';

export default function ExportModal({ show, onClose, dashboardName, onExport }) {
  const [format, setFormat] = useState('pdf');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const target = document.getElementById('dashboard-content');
      if (!target) return;

      const canvas = await html2canvas(target, {
        backgroundColor: TOKENS.bg.deep,
        scale: 2,
        useCORS: true,
        logging: false,
      });

      if (format === 'png') {
        const link = document.createElement('a');
        link.download = `${dashboardName || 'dashboard'}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } else {
        const { jsPDF } = await import('jspdf');
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? 'landscape' : 'portrait', unit: 'px', format: [canvas.width, canvas.height] });
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
        pdf.save(`${dashboardName || 'dashboard'}.pdf`);
      }
      onExport?.();
      onClose?.();
    } catch (err) {
      console.error('Export failed:', err);
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
