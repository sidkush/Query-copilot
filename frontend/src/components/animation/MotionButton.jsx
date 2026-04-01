import { motion } from "framer-motion";

export default function MotionButton({
  children,
  className = "",
  onClick,
  disabled = false,
  type = "button",
  ...props
}) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={className}
      whileHover={disabled ? {} : { scale: 1.04, y: -2 }}
      whileTap={disabled ? {} : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      {...props}
    >
      {children}
    </motion.button>
  );
}
