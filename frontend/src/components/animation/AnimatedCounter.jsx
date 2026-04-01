import { useEffect, useRef } from "react";
import { useInView } from "framer-motion";
import gsap from "gsap";

export default function AnimatedCounter({
  value,
  duration = 1.8,
  decimals = 0,
  prefix = "",
  suffix = "",
  className = "",
}) {
  const ref = useRef(null);
  const counterRef = useRef({ val: 0 });
  const hasAnimated = useRef(false);
  const isInView = useInView(ref, { once: true, margin: "-40px" });

  useEffect(() => {
    if (!isInView || hasAnimated.current || !ref.current) return;
    hasAnimated.current = true;

    const target = typeof value === "number" ? value : parseFloat(value) || 0;
    counterRef.current.val = 0;

    gsap.to(counterRef.current, {
      val: target,
      duration,
      ease: "power2.out",
      snap: { val: decimals === 0 ? 1 : 1 / Math.pow(10, decimals) },
      onUpdate: () => {
        if (ref.current) {
          ref.current.textContent =
            prefix + counterRef.current.val.toFixed(decimals) + suffix;
        }
      },
    });
  }, [isInView, value, duration, decimals, prefix, suffix]);

  return (
    <span ref={ref} className={className}>
      {prefix}0{suffix}
    </span>
  );
}
