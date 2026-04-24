"""Phase K deploy-time verifier — confirm every ladder model resolves via Anthropic.

Called by: CI on release branch, admin before deploy.
Exits 0 on success, nonzero on failure. Prints resolved model IDs.
"""
from __future__ import annotations

import sys


def main():
    try:
        sys.path.insert(0, "backend")
        from config import settings
        from anthropic_provider import AnthropicProvider
    except Exception as exc:
        print(f"FAIL: import error — {exc}")
        sys.exit(1)

    wanted = {
        "step_exec": settings.MODEL_LADDER_STEP_EXEC,
        "plan_emit": settings.MODEL_LADDER_PLAN_EMIT,
        "recovery": settings.MODEL_LADDER_RECOVERY,
    }
    print("Ladder config:")
    for role, model in wanted.items():
        print(f"  {role}: {model}")

    import os
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY unset — skipping live check.")
        print("OK (config-only)")
        sys.exit(0)

    print("Pinging Anthropic with 1-token dummy for each tier...")
    for role, model in wanted.items():
        try:
            provider = AnthropicProvider(
                api_key=os.environ["ANTHROPIC_API_KEY"],
                default_model=model,
            )
            _ = provider.invoke(system="", user="ping", max_tokens=1)
            print(f"  {role}: OK")
        except Exception as exc:
            print(f"  {role}: FAIL — {exc}")
            sys.exit(1)
    print("OK")


if __name__ == "__main__":
    main()
