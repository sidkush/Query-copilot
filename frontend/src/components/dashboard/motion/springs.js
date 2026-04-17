/**
 * Shared Framer Motion spring / transition presets.
 * Premium feel: high damping, no visible overshoot.
 * Use these instead of ad-hoc { stiffness, damping } spread through components.
 */

export const SPRINGS = {
  // Snappy — taps, mode toggles, pill slides
  snappy: { type: 'spring', stiffness: 420, damping: 38, mass: 0.8 },
  // Fluid — tile resize, panel drag, generic
  fluid: { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 },
  // Soft — entrance / reveal
  soft: { type: 'spring', stiffness: 180, damping: 28, mass: 1 },
};

export const TWEENS = {
  quick: { duration: 0.16, ease: [0.22, 1, 0.36, 1] },
  ease: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
  slow: { duration: 0.48, ease: [0.16, 1, 0.3, 1] },
};

/**
 * Stagger container variants — spread on parent `<motion.*>` with variants prop.
 * Each child must also have variants={STAGGER_CHILD_VARIANTS}.
 */
export const STAGGER_CONTAINER_VARIANTS = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.055,
      delayChildren: 0.04,
    },
  },
};

export const STAGGER_CHILD_VARIANTS = {
  hidden: { opacity: 0, y: 10, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 260, damping: 30 },
  },
};
