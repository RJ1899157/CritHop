from types import SimpleNamespace

import yaml

from pipeline import crithop


class FakeGroq:
    def __init__(self, *args, **kwargs):
        pass


class FakeCritic:
    def __init__(self, *args, **kwargs):
        pass


class FakeGraph:
    def __init__(self, passages, config):
        self.passages = passages

    def build(self):
        return {"nodes": {}, "adjacency": {}}


class FakeBM25:
    def __init__(self, passages):
        self.passages = passages


class FakeBGE:
    def __init__(self, passages, model_name, device="cpu", *args, **kwargs):
        self.passages = passages


class FakeHybrid:
    def __init__(self, bm25, bge):
        pass

    def retrieve(self, question, top_k):
        return [(0, 1.0)]


class FakeTraverser:
    def __init__(self, graph, config, groq_client, isrel, *args, **kwargs):
        self.hop_log = [{
            "hop": 1,
            "passages_considered": [0],
            "isrel_decisions": {0: True},
            "reasoning_step": "find the answer",
            "llm_reasoning_step": "use passage 0",
        }]

    def traverse(self, question, start_passages):
        return ["Marie Curie was Polish."]


class FakeGenerator:
    def __init__(self, groq_client, model, issup, isuse):
        pass

    def generate(self, question, passages):
        return {
            "answer": "Polish",
            "supporting_passages": passages,
            "issup_scores": [True],
            "isuse_score": True,
            "retrieval_retry": False,
        }


def test_crithop_run_returns_required_structure(monkeypatch, tmp_path):
    monkeypatch.setenv("USE_RERANKER", "false")
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.safe_dump({"model": "test", "top_k_retrieval": 1}))

    monkeypatch.setattr(crithop, "Groq", FakeGroq)
    monkeypatch.setattr(crithop, "IsRel", FakeCritic)
    monkeypatch.setattr(crithop, "IsSup", FakeCritic)
    monkeypatch.setattr(crithop, "IsUse", FakeCritic)
    monkeypatch.setattr(crithop, "PassageGraph", FakeGraph)
    monkeypatch.setattr(crithop, "BM25Retriever", FakeBM25)
    monkeypatch.setattr(crithop, "BGERetriever", FakeBGE)
    monkeypatch.setattr(crithop, "HybridRetriever", FakeHybrid)
    monkeypatch.setattr(crithop, "HopTraverser", FakeTraverser)
    monkeypatch.setattr(crithop, "Generator", FakeGenerator)

    pipeline = crithop.CritHop(str(config_path))
    result = pipeline.run("What nationality?", ["Marie Curie was Polish."])

    assert set(result) == {
        "question",
        "answer",
        "hop_trace",
        "critique_log",
        "supporting_passages",
        "retrieval_retry",
        "graph",
    }
    assert result["question"] == "What nationality?"
    assert isinstance(result["answer"], str)
    assert isinstance(result["supporting_passages"], list)
    assert result["retrieval_retry"] is False


def test_crithop_output_trace_and_critique_log_structure(monkeypatch, tmp_path):
    monkeypatch.setenv("USE_RERANKER", "false")
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.safe_dump({"model": "test", "top_k_retrieval": 1}))

    for name, value in {
        "Groq": FakeGroq,
        "IsRel": FakeCritic,
        "IsSup": FakeCritic,
        "IsUse": FakeCritic,
        "PassageGraph": FakeGraph,
        "BM25Retriever": FakeBM25,
        "BGERetriever": FakeBGE,
        "HybridRetriever": FakeHybrid,
        "HopTraverser": FakeTraverser,
        "Generator": FakeGenerator,
    }.items():
        monkeypatch.setattr(crithop, name, value)

    result = crithop.CritHop(str(config_path)).run("Question", ["Passage"])

    assert result["hop_trace"][0]["hop"] == 1
    assert "passages_considered" in result["hop_trace"][0]
    assert "isrel_decisions" in result["hop_trace"][0]
    assert "reasoning_step" in result["hop_trace"][0]
    assert set(result["critique_log"]) == {
        "isrel_decisions",
        "issup_decisions",
        "isuse_decision",
    }
