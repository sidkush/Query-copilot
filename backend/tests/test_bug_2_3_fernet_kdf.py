"""
Test for Bug 2.3: SHA-256 Fernet KDF is too fast to brute-force.

The bug: _fernet() derives the Fernet key from JWT_SECRET_KEY using a
single SHA-256 pass. An attacker who obtains ciphertext can brute-force
the JWT secret at GPU speed.

The fix: Use PBKDF2-HMAC-SHA256 with >=100,000 iterations and a fixed
salt (derived from the app name, since we need deterministic output).
"""

import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

MODULE_PATH = os.path.join(os.path.dirname(__file__), "..", "user_storage.py")


def _load_source():
    with open(MODULE_PATH, "r") as f:
        return f.read()


def test_fernet_uses_pbkdf2():
    """_fernet() fallback path must use PBKDF2, not plain SHA-256."""
    source = _load_source()
    assert "pbkdf2_hmac" in source, (
        "_fernet() must use hashlib.pbkdf2_hmac() for key derivation, "
        "not a single SHA-256 pass"
    )


def test_pbkdf2_iterations_at_least_100k():
    """PBKDF2 must use at least 100,000 iterations."""
    source = _load_source()
    # Find the pbkdf2_hmac call and extract the iterations parameter
    match = re.search(r"pbkdf2_hmac\s*\([^)]*iterations\s*=\s*(\d+)", source)
    if not match:
        # Try positional: pbkdf2_hmac("sha256", key, salt, iterations)
        match = re.search(
            r"pbkdf2_hmac\s*\(\s*[\"']sha256[\"']\s*,\s*[^,]+,\s*[^,]+,\s*(\d+)",
            source,
        )
    assert match, "Could not find pbkdf2_hmac iterations parameter"
    iterations = int(match.group(1))
    assert iterations >= 100_000, (
        f"PBKDF2 uses {iterations} iterations, must be >= 100,000"
    )


def test_encrypt_decrypt_roundtrip():
    """encrypt_password / decrypt_password must still round-trip correctly."""
    from user_storage import encrypt_password, decrypt_password

    original = "MyS3cretP@ss!"
    ciphertext = encrypt_password(original)
    assert ciphertext != original, "Ciphertext must differ from plaintext"
    decrypted = decrypt_password(ciphertext)
    assert decrypted == original, (
        f"Round-trip failed: expected '{original}', got '{decrypted}'"
    )


def test_no_bare_sha256_in_fernet():
    """The _fernet fallback must NOT use bare hashlib.sha256().digest()."""
    source = _load_source()
    # Find the _fernet function body
    match = re.search(r"def _fernet\(\).*?(?=\ndef |\Z)", source, re.DOTALL)
    assert match, "Could not find _fernet function"
    fernet_body = match.group()
    # There should be no bare sha256().digest() — only pbkdf2_hmac
    assert "sha256(key_bytes).digest()" not in fernet_body, (
        "_fernet() still uses bare SHA-256 for key derivation"
    )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
