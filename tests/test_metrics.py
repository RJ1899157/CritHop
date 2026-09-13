import pytest
from eval.metrics import exact_match, f1_score


def test_exact_match_identical():
    assert exact_match("Marie Curie", "marie curie") == 1.0


def test_exact_match_different():
    assert exact_match("Marie Curie", "Albert Einstein") == 0.0


def test_f1_score_partial_overlap():
    assert f1_score("Marie Curie physicist", "Marie Curie") > 0.5


def test_f1_score_no_overlap():
    assert f1_score("wrong answer", "Marie Curie") == 0.0
