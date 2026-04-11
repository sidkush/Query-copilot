"""
Test for Bug 1.3: Unpinned dependencies allow supply chain attacks.

The bug: All dependencies use >= version constraints. pip install
could pull a compromised newer version.

The fix: Pin critical security/framework packages to == versions.
"""

import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

REQUIREMENTS_PATH = os.path.join(
    os.path.dirname(__file__), "..", "requirements.txt"
)

# Packages that MUST be pinned (security-critical or framework-breaking)
CRITICAL_PACKAGES = [
    "fastapi",
    "pydantic",
    "anthropic",
    "sqlglot",
    "python-jose",
    "bcrypt",
    "sqlalchemy",
]


def _load_requirements():
    with open(REQUIREMENTS_PATH, "r") as f:
        return f.read()


def test_critical_packages_pinned():
    """Critical packages must use == (exact version), not >= (minimum)."""
    content = _load_requirements()
    unpinned = []
    for pkg in CRITICAL_PACKAGES:
        # Match the package name (case-insensitive) followed by >= but not ==
        pattern = rf"(?i)^{re.escape(pkg)}(?:\[[^\]]*\])?\s*>=\s*"
        if re.search(pattern, content, re.MULTILINE):
            unpinned.append(pkg)
    assert not unpinned, (
        f"These critical packages use >= instead of ==: {', '.join(unpinned)}. "
        f"Pin them to exact versions to prevent supply chain attacks."
    )


def test_pinned_versions_are_valid():
    """Pinned versions must have a valid semver-ish format."""
    content = _load_requirements()
    for pkg in CRITICAL_PACKAGES:
        pattern = rf"(?i)^{re.escape(pkg)}(?:\[[^\]]*\])?\s*==\s*([\d.]+)"
        match = re.search(pattern, content, re.MULTILINE)
        assert match, f"{pkg} not found with == pin in requirements.txt"
        version = match.group(1)
        parts = version.split(".")
        assert len(parts) >= 2, (
            f"{pkg}=={version} — pin to at least major.minor"
        )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
