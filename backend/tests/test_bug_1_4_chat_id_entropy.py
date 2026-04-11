"""
Test for Bug 1.4: chat_id nonce only 64 bits.

The bug: secrets.token_hex(8) produces only 64 bits of entropy.
Birthday collision at ~2^32 sessions.

The fix: Change to secrets.token_hex(16) for 128 bits.
"""

import os
import sys
import re

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

MODULE_PATH = os.path.join(
    os.path.dirname(__file__), "..", "routers", "agent_routes.py"
)


def _load_source():
    with open(MODULE_PATH, "r") as f:
        return f.read()


def test_chat_id_uses_at_least_128_bits():
    """chat_id nonce must use at least 128 bits (token_hex(16) or more)."""
    source = _load_source()
    # Find the token_hex call in the chat_id generation line
    match = re.search(r"secrets\.token_hex\((\d+)\)", source)
    assert match, "Could not find secrets.token_hex() call in agent_routes.py"
    num_bytes = int(match.group(1))
    assert num_bytes >= 16, (
        f"chat_id uses secrets.token_hex({num_bytes}) = {num_bytes * 8} bits. "
        f"Must be at least token_hex(16) = 128 bits to avoid birthday collisions."
    )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
