"""Prompt templates for binary Self-RAG-style critique decisions."""

ISREL_PROMPT = """Given the question: {question}
Current reasoning step: {reasoning_step}
Passage: {passage}
Is this passage relevant to answering the current reasoning step? Answer with only YES or NO."""


ISSUP_PROMPT = """Given the question: {question}
Passage: {passage}
Proposed answer: {answer}
Does this passage directly support the proposed answer? Answer with only YES or NO."""


ISUSE_PROMPT = """Given the question: {question}
Generated answer: {answer}
Is this answer useful, complete, and directly addresses the question? Answer with only YES or NO."""
