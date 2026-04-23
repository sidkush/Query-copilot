import { motion, AnimatePresence } from 'framer-motion';

export default function IntentEcho({ card, onAccept, onChoose }) {
  if (!card) return null;
  const { mode, operational_definition, interpretations, warnings, banner } = card;

  if (mode === 'auto_proceed' && !banner) return null;

  return (
    <AnimatePresence>
      <motion.section
        role="region"
        aria-label="Operational definition check"
        layout
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 140, damping: 18 }}
        className="intent-echo"
      >
        {banner && (
          <div className="intent-echo-banner" aria-live="polite">
            <span aria-hidden="true">⚠</span>
            <span>{banner}</span>
          </div>
        )}

        {mode !== 'auto_proceed' && (
          <>
            <p className="intent-echo-label">Interpreted as</p>
            <p className="intent-echo-definition">{operational_definition}</p>

            {warnings?.length > 0 && (
              <ul className="intent-echo-warnings" aria-live="polite">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}

            <div className="intent-echo-actions">
              {mode === 'proceed_button' && (
                <button
                  type="button"
                  className="intent-echo-primary"
                  onClick={onAccept}
                  autoFocus
                >
                  Proceed
                </button>
              )}
              {mode === 'mandatory_choice' && interpretations.map((intp) => (
                <button
                  key={intp.id}
                  type="button"
                  className="intent-echo-pill"
                  onClick={() => onChoose(intp.id)}
                >
                  {intp.text}
                </button>
              ))}
            </div>
          </>
        )}
      </motion.section>
    </AnimatePresence>
  );
}
