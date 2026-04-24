import pytest
from agent_cancel_2pc import begin_cancel, commit_cancel, abort_cancel, CancelNotPrepared

def test_commit_requires_begin():
    with pytest.raises(CancelNotPrepared):
        commit_cancel(chat_id="c1")

def test_begin_then_commit_succeeds():
    begin_cancel(chat_id="c2")
    commit_cancel(chat_id="c2")

def test_abort_clears_prepared_state():
    begin_cancel(chat_id="c3")
    abort_cancel(chat_id="c3")
    with pytest.raises(CancelNotPrepared):
        commit_cancel(chat_id="c3")
