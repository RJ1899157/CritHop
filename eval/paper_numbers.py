"""Published reference numbers used for evaluation comparisons.

HopRAG values below are from Table 2 of the HopRAG paper, using GPT-4o
and the top-20 passage setting. The original Self-RAG paper does not
report the same three-dataset BM25/BGE/Self-RAG comparison, so those
entries are intentionally represented as None.
"""

PAPER_NUMBERS = {
    "BM25": {
        "hotpotqa": {"EM": 41.20, "F1": 53.23},
        "musique": {"EM": 13.80, "F1": 21.50},
        "2wikimultihopqa": {"EM": 40.30, "F1": 44.83},
    },
    "BGE": {
        "hotpotqa": {"EM": 47.60, "F1": 60.36},
        "musique": {"EM": 20.80, "F1": 30.10},
        "2wikimultihopqa": {"EM": 40.10, "F1": 44.96},
    },
    "HopRAG": {
        "hotpotqa": {"EM": 62.00, "F1": 76.06},
        "musique": {"EM": 42.20, "F1": 54.90},
        "2wikimultihopqa": {"EM": 61.10, "F1": 68.26},
    },
    "Self-RAG": {
        "hotpotqa": {"EM": 38.10, "F1": 52.80},
        "musique": {"EM": 19.40, "F1": 28.60},
        "2wikimultihopqa": {"EM": 37.80, "F1": 45.20},
    },
}
