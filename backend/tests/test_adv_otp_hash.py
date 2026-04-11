"""
Test A1: OTP codes must be stored as HMAC hashes, not plaintext.

The bug: generate_otp() stored raw 6-digit codes in otp_store.json.
The fix: Store hmac(JWT_SECRET_KEY, code, sha256).hexdigest() instead.
"""

import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

SOURCE_PATH = os.path.join(os.path.dirname(__file__), "..", "otp.py")


def _load_source():
    with open(SOURCE_PATH, "r", encoding="utf-8") as f:
        return f.read()


def test_hmac_code_function_exists():
    """otp.py must define an _hmac_code helper that uses hmac + sha256."""
    source = _load_source()
    assert "_hmac_code" in source, "Missing _hmac_code function"
    assert "hmac" in source, "Must use hmac module"


def test_generate_stores_hash_not_plaintext():
    """generate_otp must store _hmac_code(code), not the raw code."""
    source = _load_source()
    match = re.search(r"def generate_otp\(.*?(?=\ndef |\Z)", source, re.DOTALL)
    assert match, "Could not find generate_otp function"
    body = match.group()

    # Must call _hmac_code when storing the code
    assert "_hmac_code" in body, (
        "generate_otp does not call _hmac_code — raw OTP code stored in JSON"
    )
    # Must NOT store the raw code variable directly
    raw_store = re.search(r'"code"\s*:\s*code\b', body)
    assert not raw_store, (
        "generate_otp stores raw 'code' variable — must use _hmac_code(code)"
    )


def test_verify_compares_hashes():
    """verify_otp must compare hmac hashes, not plaintext codes."""
    source = _load_source()
    match = re.search(r"def verify_otp\(.*?(?=\ndef |\Z)", source, re.DOTALL)
    assert match, "Could not find verify_otp function"
    body = match.group()

    assert "_hmac_code" in body, (
        "verify_otp does not call _hmac_code — comparing plaintext codes"
    )
    assert "compare_digest" in body, (
        "verify_otp must use hmac.compare_digest for constant-time comparison"
    )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
