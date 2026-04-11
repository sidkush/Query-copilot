"""
Test for Bug 2.1: OTP plaintext storage.

The bug: generate_otp() stores the raw 6-digit code in otp_store.json.
An attacker who reads the file can see every active OTP.

The fix: Store hmac(secret, code) instead. verify_otp() computes the
same HMAC and compares hashes — never stores or compares plaintext.
"""

import json
import os
import re
import sys
import tempfile
import threading

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _isolated_otp_module(tmp_dir):
    """Import otp module with store redirected to a temp directory."""
    import otp as otp_mod

    otp_mod.DATA_DIR = tmp_dir
    otp_mod.OTP_STORE_FILE = os.path.join(tmp_dir, "otp_store.json")
    otp_mod.SENT_OTPS_LOG = os.path.join(tmp_dir, "sent_otps.log")
    return otp_mod


def test_stored_code_is_not_plaintext():
    """The OTP store must NOT contain the raw 6-digit code."""
    with tempfile.TemporaryDirectory() as tmp:
        otp_mod = _isolated_otp_module(tmp)
        code = otp_mod.generate_otp("test@example.com", "email")

        # Read the raw store file
        with open(otp_mod.OTP_STORE_FILE, "r") as f:
            store = json.load(f)

        entry = store.get("email:test@example.com")
        assert entry is not None, "OTP entry not found in store"
        stored_value = entry.get("code", "")
        assert stored_value != code, (
            f"OTP store contains plaintext code '{code}'. "
            f"Must store a hash instead."
        )


def test_stored_code_looks_like_hash():
    """The stored 'code' field should be a hex digest (64 chars for SHA-256)."""
    with tempfile.TemporaryDirectory() as tmp:
        otp_mod = _isolated_otp_module(tmp)
        otp_mod.generate_otp("hash@example.com", "email")

        with open(otp_mod.OTP_STORE_FILE, "r") as f:
            store = json.load(f)

        entry = store["email:hash@example.com"]
        stored_value = entry["code"]
        assert re.fullmatch(r"[0-9a-f]{64}", stored_value), (
            f"Stored code '{stored_value}' doesn't look like a SHA-256 hex digest"
        )


def test_verify_still_works_after_hashing():
    """verify_otp() must still accept the correct code after hash storage."""
    with tempfile.TemporaryDirectory() as tmp:
        otp_mod = _isolated_otp_module(tmp)
        code = otp_mod.generate_otp("verify@example.com", "email")
        assert otp_mod.verify_otp("verify@example.com", "email", code), (
            "verify_otp() rejected a valid code after hash storage"
        )


def test_wrong_code_rejected_after_hashing():
    """verify_otp() must reject an incorrect code."""
    with tempfile.TemporaryDirectory() as tmp:
        otp_mod = _isolated_otp_module(tmp)
        otp_mod.generate_otp("wrong@example.com", "email")
        assert not otp_mod.verify_otp("wrong@example.com", "email", "000000"), (
            "verify_otp() accepted an incorrect code"
        )


def test_plaintext_code_not_in_store_file_raw():
    """The raw file bytes must not contain the 6-digit code anywhere."""
    with tempfile.TemporaryDirectory() as tmp:
        otp_mod = _isolated_otp_module(tmp)
        code = otp_mod.generate_otp("raw@example.com", "email")

        with open(otp_mod.OTP_STORE_FILE, "r") as f:
            raw = f.read()

        assert code not in raw, (
            f"Plaintext OTP '{code}' found in raw store file"
        )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
