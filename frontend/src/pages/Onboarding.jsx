import { useState, useEffect, lazy, Suspense, Component } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "../store";
import AnimatedBackground from "../components/animation/AnimatedBackground";
import { GPUTierProvider } from "../lib/gpuDetect";
import OnboardingWelcome from "../components/onboarding/OnboardingWelcome";
import OnboardingTour from "../components/onboarding/OnboardingTour";
import OnboardingApiKey from "../components/onboarding/OnboardingApiKey";
import OnboardingConnect from "../components/onboarding/OnboardingConnect";
import OnboardingFirstQuery from "../components/onboarding/OnboardingFirstQuery";

const PageBackground3D = lazy(() => import("../components/animation/PageBackground3D"));

// WebGL error boundary — same pattern as Account.jsx
class _WebGLBound extends Component {
  constructor(p) { super(p); this.state = { e: false }; }
  static getDerivedStateFromError() { return { e: true }; }
  render() { return this.state.e ? this.props.fallback : this.props.children; }
}

const TOTAL_STEPS = 5;

const slideVariants = {
  enter: (direction) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction) => ({
    x: direction > 0 ? -300 : 300,
    opacity: 0,
  }),
};

function ProgressDots({ current, total }) {
  return (
    <div className="flex items-center gap-2 justify-center py-6">
      {Array.from({ length: total }, (_, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === current;
        const isComplete = stepNum < current;
        return (
          <motion.div
            key={stepNum}
            className={`rounded-full transition-all duration-300 ${
              isActive
                ? "w-8 h-2 bg-purple-500 shadow-lg shadow-purple-500/40"
                : isComplete
                  ? "w-2 h-2 bg-purple-400/60"
                  : "w-2 h-2 bg-white/15"
            }`}
            layout
          />
        );
      })}
    </div>
  );
}

export default function Onboarding() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const setOnboardingComplete = useStore((s) => s.setOnboardingComplete);
  const initialStep = Math.min(
    Math.max(parseInt(searchParams.get("step") || "1", 10), 1),
    TOTAL_STEPS,
  );
  const [step, setStep] = useState(initialStep);
  const [direction, setDirection] = useState(1);

  // Sync step to URL
  useEffect(() => {
    setSearchParams({ step: String(step) }, { replace: true });
  }, [step, setSearchParams]);

  const goNext = () => {
    if (step < TOTAL_STEPS) {
      setDirection(1);
      setStep((s) => s + 1);
    }
  };

  const handleFinish = () => {
    setOnboardingComplete(true);
    navigate("/dashboard");
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return <OnboardingWelcome onNext={goNext} />;
      case 2:
        return <OnboardingTour onNext={goNext} />;
      case 3:
        return <OnboardingApiKey onNext={goNext} onSkip={handleFinish} isDemo={false} />;
      case 4:
        return <OnboardingConnect onNext={goNext} />;
      case 5:
        return <OnboardingFirstQuery onNext={handleFinish} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#06060e] relative min-h-screen">
      <div className="fixed inset-0 mesh-gradient opacity-30 pointer-events-none" />
      <GPUTierProvider>
        <_WebGLBound fallback={<AnimatedBackground className="fixed inset-0 pointer-events-none" />}>
          <Suspense fallback={<AnimatedBackground className="fixed inset-0 pointer-events-none" />}>
            <PageBackground3D mode="data" className="fixed inset-0" />
          </Suspense>
        </_WebGLBound>
      </GPUTierProvider>

      <div className="relative z-10">
        <ProgressDots current={step} total={TOTAL_STEPS} />

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30, duration: 0.35 }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
