import React from 'react';
import { motion } from 'framer-motion';
import {
  STAGGER_CONTAINER_VARIANTS,
  STAGGER_CHILD_VARIANTS,
} from './springs';

/**
 * Stagger-reveal wrapper for dashboard tile grids.
 * Parent renders once with `initial="hidden" animate="visible"`.
 * Each direct-child gets a spring-lifted fade-in with index-based delay.
 *
 * Usage:
 *   <TileReveal>
 *     {tiles.map((t) => <TileReveal.Child key={t.id}>{...}</TileReveal.Child>)}
 *   </TileReveal>
 *
 * If you need a non-<div> container (grid, section, etc.), pass `as`:
 *   <TileReveal as="section" className="...">...</TileReveal>
 *
 * For react-grid-layout (where children must be raw divs with layout props),
 * skip this wrapper and use the CSS class `premium-mount-stagger` on the
 * GridLayout parent with `style={{ '--mount-index': idx }}` on each child.
 */
function TileReveal({ as = 'div', className = '', style, children, ...rest }) {
  const MotionTag = motion[as] || motion.div;
  return (
    <MotionTag
      className={className}
      style={style}
      variants={STAGGER_CONTAINER_VARIANTS}
      initial="hidden"
      animate="visible"
      {...rest}
    >
      {children}
    </MotionTag>
  );
}

function TileRevealChild({ as = 'div', className = '', style, children, ...rest }) {
  const MotionTag = motion[as] || motion.div;
  return (
    <MotionTag
      className={className}
      style={style}
      variants={STAGGER_CHILD_VARIANTS}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}

TileReveal.Child = TileRevealChild;

export default TileReveal;
