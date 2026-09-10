import numpy as np

from graph import builder


class FakeSentenceTransformer:
    def __init__(self, model_name):
        self.model_name = model_name

    def encode(self, passages, **kwargs):
        vectors = np.array([
            [1.0, 0.0],
            [0.9, 0.4358899],
            [0.0, 1.0],
        ])
        return vectors[: len(passages)]


def test_passage_graph_builds_with_correct_node_count(monkeypatch):
    monkeypatch.setattr(builder, "load_embedding_model", lambda *args: FakeSentenceTransformer("fake"))
    graph = builder.PassageGraph(["close", "also close", "far"], {
        "embedding_model": "fake",
        "graph_similarity_threshold": 0.8,
    })

    result = graph.build()

    assert len(result["nodes"]) == 3
    assert set(result["nodes"]) == {0, 1, 2}


def test_get_neighbors_returns_a_list(monkeypatch):
    monkeypatch.setattr(builder, "load_embedding_model", lambda *args: FakeSentenceTransformer("fake"))
    graph = builder.PassageGraph(["a", "b", "c"], {"embedding_model": "fake"})
    graph.build()

    assert isinstance(graph.get_neighbors(0), list)


def test_edges_only_exist_above_similarity_threshold(monkeypatch):
    monkeypatch.setattr(builder, "load_embedding_model", lambda *args: FakeSentenceTransformer("fake"))
    graph = builder.PassageGraph(["close", "also close", "far"], {
        "embedding_model": "fake",
        "graph_similarity_threshold": 0.8,
    })
    graph.build()

    assert 1 in graph.get_neighbors(0)
    assert 2 not in graph.get_neighbors(0)
    assert 2 not in graph.get_neighbors(1)
