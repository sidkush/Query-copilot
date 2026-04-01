import { motion } from "framer-motion";

const variants = {
  initial: { opacity: 0, y: 20, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -12, filter: "blur(4px)" },
};

export default function PageTransition({ children, className = "" }) {
  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={`flex-1 flex flex-col min-h-0 ${className}`}
      style={{ willChange: "opacity, transform, filter" }}
    >
      {children}
    </motion.div>
  );
}
