import pytest
from sso_hardening import (
    parse_saml_safely,
    check_nonce,
    jwt_decode_strict,
    enforce_pci_mode,
    XXEAttempt,
    ReplayAttempt,
)


def test_saml_parse_rejects_entity_expansion():
    payload = b'''<?xml version="1.0"?>
<!DOCTYPE root [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<root>&xxe;</root>'''
    with pytest.raises(XXEAttempt):
        parse_saml_safely(payload)


def test_saml_parse_accepts_clean_xml():
    payload = b'<?xml version="1.0"?><root><hello/></root>'
    doc = parse_saml_safely(payload)
    assert doc is not None


def test_nonce_replay_detected(monkeypatch):
    import sso_hardening
    monkeypatch.setattr(sso_hardening, "get_redis", lambda: None)
    from sso_hardening import _MEM_NONCE
    _MEM_NONCE.clear()
    check_nonce("abc-123")
    with pytest.raises(ReplayAttempt):
        check_nonce("abc-123")


def test_jwt_decode_rejects_malformed():
    with pytest.raises(Exception):
        jwt_decode_strict("not.a.real.jwt", secret="any")


def test_pci_mode_rejects_demo_user(monkeypatch):
    monkeypatch.setattr("config.settings.ASKDB_PCI_MODE", True)
    with pytest.raises(RuntimeError, match="PCI mode"):
        enforce_pci_mode(demo_enabled=True)


def test_pci_mode_passes_when_demo_disabled(monkeypatch):
    monkeypatch.setattr("config.settings.ASKDB_PCI_MODE", True)
    enforce_pci_mode(demo_enabled=False)
