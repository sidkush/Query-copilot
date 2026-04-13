import { useRef, useEffect, Component } from "react";
import { useStore } from "../../store";
import { TOKENS } from "../dashboard/tokens";
import AgentStepRenderer from "./AgentStepRenderer";

// Error boundary to prevent malformed step data from crashing the host page
class StepFeedErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", textAlign: "center" }}>
          <div>
            <div style={{ color: TOKENS.danger, fontSize: "13px", marginBottom: "8px" }}>Agent feed encountered an error</div>
            <button onClick={() => { useStore.getState().clearAgent(); this.setState({ error: null }); }} style={{
              fontSize: "12px", padding: "4px 12px", borderRadius: TOKENS.radius.sm,
              border: `1px solid ${TOKENS.border.default}`, background: "transparent",
              color: TOKENS.text.muted, cursor: "pointer",
            }}>Retry</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AgentStepFeed({ compact = false }) {
  return <StepFeedErrorBoundary><AgentStepFeedInner compact={compact} /></StepFeedErrorBoundary>;
}

function AgentStepFeedInner({ compact = false }) {
  const agentSteps = useStore((s) => s.agentSteps);
  const agentWaiting = useStore((s) => s.agentWaiting);
  const agentWaitingOptions = useStore((s) => s.agentWaitingOptions);
  const agentChatId = useStore((s) => s.agentChatId);
  const agentChecklist = useStore((s) => s.agentChecklist);
  const agentElapsedMs = useStore((s) => s.agentElapsedMs);
  const agentEstimatedMs = useStore((s) => s.agentEstimatedMs);
  const agentVerification = useStore((s) => s.agentVerification);
  const agentLoading = useStore((s) => s.agentLoading);

  const scrollRef = useRef(null);
  const userScrolledUp = useRef(false);

  // Track whether user has scrolled away from bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      userScrolledUp.current = !atBottom;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Reset scroll tracking when steps are cleared (new conversation)
  const prevStepsLen = useRef(agentSteps.length);
  useEffect(() => {
    if (prevStepsLen.current > 0 && agentSteps.length <= 1) {
      userScrolledUp.current = false;
    }
    prevStepsLen.current = agentSteps.length;
  }, [agentSteps.length]);

  // Auto-scroll only if user hasn't scrolled up
  useEffect(() => {
    if (scrollRef.current && !userScrolledUp.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [agentSteps, agentWaiting]);

  // Empty state
  if (!agentSteps.length && !agentWaiting) {
    return (
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: "10px", padding: "24px 16px",
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: TOKENS.accentGlow,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={TOKENS.accent} strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: TOKENS.text.primary, fontFamily: "'Outfit', system-ui, sans-serif", marginBottom: 4 }}>
            Ready to help
          </div>
          <div style={{ fontSize: "12px", color: TOKENS.text.muted, maxWidth: 220, lineHeight: 1.5 }}>
            Ask about your data, build dashboards, or explore insights
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      aria-live="polite"
      aria-label="Agent execution steps"
      style={{
        flex: 1, overflowY: "auto", padding: "12px 14px",
        display: "flex", flexDirection: "column", gap: "12px",
      }}
    >
      <AgentStepRenderer
        steps={agentSteps}
        loading={agentLoading}
        waiting={agentWaiting}
        waitingOptions={agentWaitingOptions}
        chatId={agentChatId}
        checklist={agentChecklist}
        elapsedMs={agentElapsedMs}
        estimatedMs={agentEstimatedMs}
        verification={agentVerification}
        compact={compact}
      />
    </div>
  );
}
