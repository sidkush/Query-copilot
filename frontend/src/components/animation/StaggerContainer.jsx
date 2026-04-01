import { motion } from "framer-motion";

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 260,
      damping: 24,
    },
  },
};

export function StaggerContainer({ children, className = "", as = "div", ...props }) {
  const Component = motion[as] || motion.div;
  return (
    <Component
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={className}
      {...props}
    >
      {children}
    </Component>
  );
}

export function StaggerItem({ children, className = "", as = "div", ...props }) {
  const Component = motion[as] || motion.div;
  return (
    <Component variants={itemVariants} className={className} {...props}>
      {children}
    </Component>
  );
}
