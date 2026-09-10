from types import SimpleNamespace

import pytest

from critique.isrel import IsRel
from critique.issup import IsSup
from critique.isuse import IsUse


class MockGroq:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.calls = 0
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, **kwargs):
        self.calls += 1
        content = next(self.responses)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
        )


@pytest.mark.parametrize("critic", [IsRel, IsSup, IsUse])
def test_critics_return_true_for_yes(critic):
    client = MockGroq(["YES"])
    instance = critic(model="test", client=client)
    if critic is IsRel:
        result = instance.critique("question", "step", "passage")
    elif critic is IsSup:
        result = instance.critique("question", "passage", "answer")
    else:
        result = instance.critique("question", "answer")
    assert result is True
    assert client.calls == 1


@pytest.mark.parametrize("critic", [IsRel, IsSup, IsUse])
def test_critics_return_false_for_no(critic):
    client = MockGroq(["NO"])
    instance = critic(model="test", client=client)
    if critic is IsRel:
        result = instance.critique("question", "step", "passage")
    elif critic is IsSup:
        result = instance.critique("question", "passage", "answer")
    else:
        result = instance.critique("question", "answer")
    assert result is False
    assert client.calls == 1


@pytest.mark.parametrize("critic", [IsRel, IsSup, IsUse])
def test_critics_retry_unexpected_response(critic):
    client = MockGroq(["MAYBE", "YES"])
    instance = critic(model="test", client=client)
    if critic is IsRel:
        result = instance.critique("question", "step", "passage")
    elif critic is IsSup:
        result = instance.critique("question", "passage", "answer")
    else:
        result = instance.critique("question", "answer")
    assert result is True
    assert client.calls == 2

