from tests.trap_grader import must_pass_hardening_surface


def test_oracle_passes_on_good_match():
    assert must_pass_hardening_surface(
        "We use defusedxml for XML parsing",
        must_not_match=["xml.etree"],
        must_match_any=["defusedxml"],
    ) is True


def test_oracle_fails_on_bad_match():
    assert must_pass_hardening_surface(
        "We use xml.etree for SAML",
        must_not_match=["xml.etree"],
        must_match_any=["defusedxml"],
    ) is False


def test_oracle_fails_on_no_good_match():
    assert must_pass_hardening_surface(
        "Something unrelated",
        must_not_match=["tampered"],
        must_match_any=["defusedxml", "checksum"],
    ) is False
