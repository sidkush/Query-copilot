import { useEffect, useRef, useMemo } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * ScrollReveal — ReactBits-inspired word-by-word scroll reveal.
 * Uses GSAP ScrollTrigger to animate opacity, blur, and rotation
 * as each word scrolls into view.
 *
 * @param {string} children — plain text string to animate
 * @param {boolean} enableBlur — toggle blur effect (default true)
 * @param {number} baseOpacity — starting opacity for words (default 0.1)
 * @param {number} baseRotation — starting rotation in degrees (default 3)
 * @param {number} blurStrength — blur amount in px (default 4)
 * @param {string} rotationEnd — ScrollTrigger end for rotation (default "bottom bottom")
 * @param {string} wordAnimationEnd — ScrollTrigger end for word reveal (default "bottom bottom")
 * @param {string} containerClassName — extra classes on the outer wrapper
 * @param {string} textClassName — extra classes on the text element
 */
export default function ScrollReveal({
  children,
  enableBlur = true,
  baseOpacity = 0.1,
  baseRotation = 3,
  blurStrength = 4,
  rotationEnd = "bottom bottom",
  wordAnimationEnd = "bottom bottom",
  containerClassName = "",
  textClassName = "",
}) {
  const containerRef = useRef(null);

  const splitText = useMemo(() => {
    const text = typeof children === "string" ? children : "";
    return text.split(/(\s+)/).map((word, index) => {
      if (word.match(/^\s+$/)) return word;
      return (
        <span className="sr-word" key={index}>
          {word}
        </span>
      );
    });
  }, [children]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const triggers = [];

    // Rotation animation on the whole container
    const rotTween = gsap.fromTo(
      el,
      { transformOrigin: "0% 50%", rotate: baseRotation },
      {
        ease: "none",
        rotate: 0,
        scrollTrigger: {
          trigger: el,
          start: "top bottom",
          end: rotationEnd,
          scrub: true,
        },
      }
    );
    if (rotTween.scrollTrigger) triggers.push(rotTween.scrollTrigger);

    const wordElements = el.querySelectorAll(".sr-word");

    // Word opacity stagger
    const opTween = gsap.fromTo(
      wordElements,
      { opacity: baseOpacity, willChange: "opacity, filter" },
      {
        ease: "none",
        opacity: 1,
        stagger: 0.05,
        scrollTrigger: {
          trigger: el,
          start: "top bottom-=20%",
          end: wordAnimationEnd,
          scrub: true,
        },
      }
    );
    if (opTween.scrollTrigger) triggers.push(opTween.scrollTrigger);

    // Word blur stagger
    if (enableBlur) {
      const blurTween = gsap.fromTo(
        wordElements,
        { filter: `blur(${blurStrength}px)` },
        {
          ease: "none",
          filter: "blur(0px)",
          stagger: 0.05,
          scrollTrigger: {
            trigger: el,
            start: "top bottom-=20%",
            end: wordAnimationEnd,
            scrub: true,
          },
        }
      );
      if (blurTween.scrollTrigger) triggers.push(blurTween.scrollTrigger);
    }

    return () => {
      triggers.forEach((t) => t.kill());
    };
  }, [enableBlur, baseRotation, baseOpacity, rotationEnd, wordAnimationEnd, blurStrength]);

  return (
    <div ref={containerRef} className={`scroll-reveal-container ${containerClassName}`}>
      <p className={`scroll-reveal-text ${textClassName}`}>{splitText}</p>
    </div>
  );
}
