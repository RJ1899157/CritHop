"""Local QLoRA reranker used as CritHop's Phase 2 IsREL critic."""

from __future__ import annotations

import json
import os

import torch
import torch.nn as nn
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from transformers.modeling_outputs import SequenceClassifierOutput


class _RerankerModel(nn.Module):
    def __init__(self, peft_model, hidden_size: int, num_labels: int = 2):
        super().__init__()
        self.peft_model = peft_model
        self.classifier = nn.Linear(hidden_size, num_labels)

    def forward(self, input_ids=None, attention_mask=None, **kwargs):
        outputs = self.peft_model(
            input_ids=input_ids,
            attention_mask=attention_mask,
            output_hidden_states=True,
        )
        hidden_states = outputs.hidden_states[-1]
        seq_lengths = attention_mask.sum(dim=1) - 1
        batch_idx = torch.arange(input_ids.shape[0], device=input_ids.device)
        pooled = hidden_states[batch_idx, seq_lengths]
        logits = self.classifier(pooled.float())
        return SequenceClassifierOutput(logits=logits)


class Reranker:
    """Score query-passage relevance using the trained reranker-slm adapter."""

    def __init__(self, adapter_path: str, max_length: int = 192):
        self.max_length = max_length
        self._first_inference = True
        self._score_cache: dict[tuple[str, str], float] = {}
        if not adapter_path or not os.path.exists(os.path.expanduser(adapter_path)):
            raise FileNotFoundError(
                f"Reranker adapter path does not exist: {adapter_path}. "
                "Please verify RERANKER_ADAPTER_PATH or pipeline/config.yaml."
            )
        adapter_path = os.path.abspath(os.path.expanduser(adapter_path))
        config_path = os.path.join(adapter_path, "adapter_config.json")
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"No adapter_config.json in {adapter_path}")

        with open(config_path, "r", encoding="utf-8") as file:
            base_model_name = json.load(file)["base_model_name_or_path"]

        if torch.cuda.is_available():
            self.device = "cuda"
            quantization = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch.float16,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_use_double_quant=True,
            )
            base_model = AutoModelForCausalLM.from_pretrained(
                base_model_name,
                quantization_config=quantization,
                dtype=torch.float16,
                device_map="auto",
            )
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            self.device = "mps"
            base_model = AutoModelForCausalLM.from_pretrained(
                base_model_name,
                dtype=torch.float16,
            ).to(self.device)
        else:
            self.device = "cpu"
            base_model = AutoModelForCausalLM.from_pretrained(
                base_model_name,
                dtype=torch.float32,
            )

        self.tokenizer = AutoTokenizer.from_pretrained(base_model_name)
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token

        peft_model = PeftModel.from_pretrained(base_model, adapter_path)
        peft_model.eval()
        self.model = _RerankerModel(peft_model, peft_model.config.hidden_size)

        classifier_path = os.path.join(adapter_path, "classifier_head.pt")
        if not os.path.exists(classifier_path):
            raise FileNotFoundError(f"No classifier_head.pt in {adapter_path}")
        model_device = next(peft_model.parameters()).device
        self.model.classifier.load_state_dict(
            torch.load(classifier_path, map_location=model_device, weights_only=True)
        )
        self.model.classifier = self.model.classifier.to(
            device=model_device,
            dtype=torch.float32,
        )
        self.model.eval()
        self._device = model_device
        if self.device == "cpu":
            num_threads = int(os.getenv("TORCH_NUM_THREADS", str(min(6, os.cpu_count() or 4))))
            torch.set_num_threads(num_threads)

    def _scores(self, query: str, passages: list[str], batch_size: int = 4) -> list[float]:
        if not passages:
            return []
        if getattr(self, "_first_inference", True):
            print("reranker-slm loaded, running inference")
            self._first_inference = False

        # Check cache for any previously scored pairs
        uncached_indices = []
        uncached_passages = []
        result_scores = [0.0] * len(passages)

        for idx, passage in enumerate(passages):
            key = (query, passage)
            if key in self._score_cache:
                result_scores[idx] = self._score_cache[key]
            else:
                uncached_indices.append(idx)
                uncached_passages.append(passage)

        if not uncached_passages:
            return result_scores

        for i in range(0, len(uncached_passages), batch_size):
            batch_passages = uncached_passages[i : i + batch_size]
            batch_indices = uncached_indices[i : i + batch_size]
            prompts = [
                f"[QUERY]: {query}\n[PASSAGE]: {passage}\n"
                "Is this passage relevant to the query? "
                "Answer with relevant or irrelevant."
                for passage in batch_passages
            ]
            tokens = self.tokenizer(
                prompts,
                max_length=self.max_length,
                truncation=True,
                padding=True,
                return_tensors="pt",
            )
            input_ids = tokens["input_ids"].to(self._device)
            attention_mask = tokens["attention_mask"].to(self._device)
            with torch.inference_mode():
                output = self.model(
                    input_ids=input_ids,
                    attention_mask=attention_mask,
                )
                batch_scores = torch.softmax(output.logits, dim=-1)[:, 1].cpu().tolist()
                for orig_idx, passage, score in zip(batch_indices, batch_passages, batch_scores):
                    result_scores[orig_idx] = score
                    self._score_cache[(query, passage)] = score

        return result_scores

    def rerank(self, query: str, passages: list[str]) -> list[tuple[str, float]]:
        """Return passages sorted by class-1 relevance probability."""
        scores = self._scores(query, passages)
        return sorted(zip(passages, scores), key=lambda item: item[1], reverse=True)

    def is_relevant(
        self,
        query: str,
        passage: str,
        threshold: float = 0.7,
    ) -> bool:
        """Return whether class-1 relevance probability meets the threshold."""
        if getattr(self, "_first_inference", True):
            print("reranker-slm loaded, running inference")
            self._first_inference = False
        scores = self._scores(query, [passage])
        return bool(scores and scores[0] >= threshold)
