#!/usr/bin/env python3
"""
sentiment_analysis.py — CrowdShield GenAI Pipeline | Batch 5: Social Media Sentiment Analysis

Mocked social media sentiment analysis module. Analyzes batch posts to produce an
aggregated crowd unrest score (0.0-1.0) and filter high-urgency flagged posts using LLMClient.
"""

from __future__ import annotations

import datetime
import logging
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

try:
    from llm_client import LLMClient, LLMClientError
except ImportError:
    from .llm_client import LLMClient, LLMClientError

logger = logging.getLogger(__name__)

# Weight mapping for computing aggregated unrest score
SENTIMENT_WEIGHTS: dict[str, float] = {
    "panic": 1.0,
    "distress": 0.7,
    "concerned": 0.4,
    "calm": 0.0,
}


def generate_mock_social_posts() -> list[dict[str, str]]:
    """
    Generate 12 realistic mock social media posts simulating crowd feedback.
    MOCK DATA FOR HACKATHON DEMO — real X/Instagram API access replaced with mock stream.
    """
    now = datetime.datetime.now(datetime.timezone.utc)
    fmt = lambda offset_mins: (now - datetime.timedelta(minutes=offset_mins)).strftime("%Y-%m-%dT%H:%M:%SZ")

    return [
        {
            "text": "Great vibe at the main stage! Music sounds amazing tonight 🎉",
            "platform": "Instagram",
            "timestamp": fmt(15),
        },
        {
            "text": "Water station lines are pretty long near Gate 2, bring your own bottle if you can.",
            "platform": "X",
            "timestamp": fmt(12),
        },
        {
            "text": "so packed near the main stage, can't breathe, people are pushing hard",
            "platform": "X",
            "timestamp": fmt(10),
        },
        {
            "text": "Security stewards are doing a good job directing flow at Exit C 👍",
            "platform": "Instagram",
            "timestamp": fmt(9),
        },
        {
            "text": "HELP! Someone collapsed in front of the food court and crowds are trampling backward!",
            "platform": "X",
            "timestamp": fmt(7),
        },
        {
            "text": "Heat is intense today but the festival crowd is super energetic 🔥",
            "platform": "Instagram",
            "timestamp": fmt(6),
        },
        {
            "text": "North entry gate is completely blocked, nobody is moving for 20 mins. Starting to panic.",
            "platform": "X",
            "timestamp": fmt(5),
        },
        {
            "text": "Loving the light show! Best event of the summer!",
            "platform": "Instagram",
            "timestamp": fmt(4),
        },
        {
            "text": "Avoid Zone A1 near the main exit, total bottleneck and people are getting crushed against the railing!",
            "platform": "X",
            "timestamp": fmt(3),
        },
        {
            "text": "Just grabbed food, lines are moving smoothly now.",
            "platform": "X",
            "timestamp": fmt(2),
        },
        {
            "text": "Can someone open secondary exit gates? We are suffocating in the central corridor!",
            "platform": "X",
            "timestamp": fmt(1),
        },
        {
            "text": "Headliners about to start, crowd getting huge!",
            "platform": "Instagram",
            "timestamp": fmt(0),
        },
    ]


class SentimentAnalyzer:
    """
    Analyzes social media posts in batch to extract sentiment, urgency,
    and compute an aggregated unrest score.
    """

    def __init__(self, llm_client: LLMClient | None = None) -> None:
        self.client = llm_client or LLMClient()

    def analyze_posts(self, posts: list[dict[str, str]]) -> dict[str, Any]:
        """
        Analyze a batch of social media posts in ONE LLM call.

        Parameters
        ----------
        posts : list[dict]
            List of post dicts containing at least 'text'.

        Returns
        -------
        dict
            Dict matching Phase 3 deliverable schema:
            {
              "analyzed_at": "...",
              "posts_analyzed": int,
              "aggregated_unrest_score": float,
              "flagged_posts": [...]
            }
        """
        now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        if not posts:
            return {
                "analyzed_at": now_iso,
                "posts_analyzed": 0,
                "aggregated_unrest_score": 0.0,
                "flagged_posts": [],
            }

        prompt = self._build_prompt(posts)
        schema_hint = (
            '{"analyses": ['
            '{"index": int, "sentiment": "calm"|"concerned"|"distress"|"panic", '
            '"urgency": "low"|"medium"|"high"}'
            "]}"
        )

        try:
            raw_response = self.client.generate_json(prompt, schema_hint)
            classifications = self._parse_classifications(raw_response, len(posts))
        except Exception as exc:
            logger.warning(
                "LLM sentiment analysis failed: %s. Using heuristic keyword analyzer.", exc
            )
            classifications = [self._heuristic_classify(p.get("text", "")) for p in posts]

        unrest_score = self.compute_aggregated_unrest_score(classifications)
        flagged = self._extract_flagged_posts(posts, classifications)

        return {
            "analyzed_at": now_iso,
            "posts_analyzed": len(posts),
            "aggregated_unrest_score": unrest_score,
            "flagged_posts": flagged,
        }

    @staticmethod
    def compute_aggregated_unrest_score(classifications: list[dict[str, str]]) -> float:
        """
        Compute weighted unrest score (0.0 - 1.0) from sentiment classifications.
        Weights: panic=1.0, distress=0.7, concerned=0.4, calm=0.0.
        """
        if not classifications:
            return 0.0

        total_weight = 0.0
        for item in classifications:
            sent = str(item.get("sentiment", "calm")).lower()
            weight = SENTIMENT_WEIGHTS.get(sent, 0.0)
            total_weight += weight

        avg_score = total_weight / len(classifications)
        return round(min(max(avg_score, 0.0), 1.0), 2)

    def _build_prompt(self, posts: list[dict[str, str]]) -> str:
        prompt_lines = [
            "You are a public safety sentiment analyzer for event management.",
            "Classify each of the following social media posts into:",
            "- sentiment: calm, concerned, distress, or panic",
            "- urgency: low, medium, or high",
            "",
            "Posts to analyze:",
        ]

        for idx, post in enumerate(posts):
            text = post.get("text", "")
            prompt_lines.append(f"Post {idx}: \"{text}\"")

        prompt_lines.extend([
            "",
            "Instructions:",
            "1. Output a JSON list under key 'analyses'.",
            "2. For each post, include 'index', 'sentiment', and 'urgency'.",
            "",
            'Return JSON: {"analyses": [{"index": 0, "sentiment": "distress", "urgency": "high"}]}'
        ])

        return "\n".join(prompt_lines)

    def _parse_classifications(
        self, response: dict[str, Any], expected_count: int
    ) -> list[dict[str, str]]:
        if not isinstance(response, dict) or "analyses" not in response:
            raise ValueError("Response dict missing 'analyses' list.")

        analyses = response["analyses"]
        if not isinstance(analyses, list):
            raise ValueError("'analyses' field must be a list.")

        results = []
        for item in analyses:
            if not isinstance(item, dict):
                continue
            sentiment = str(item.get("sentiment", "calm")).lower()
            urgency = str(item.get("urgency", "low")).lower()

            if sentiment not in SENTIMENT_WEIGHTS:
                sentiment = "calm"
            if urgency not in ("low", "medium", "high"):
                urgency = "low"

            results.append({"sentiment": sentiment, "urgency": urgency})

        # Pad with calm/low if LLM missed items
        while len(results) < expected_count:
            results.append({"sentiment": "calm", "urgency": "low"})

        return results[:expected_count]

    @staticmethod
    def _extract_flagged_posts(
        posts: list[dict[str, str]], classifications: list[dict[str, str]]
    ) -> list[dict[str, str]]:
        flagged = []
        for post, cls in zip(posts, classifications):
            urgency = cls.get("urgency", "low").lower()
            if urgency in ("high", "medium"):
                flagged.append({
                    "text": post.get("text", ""),
                    "sentiment": cls.get("sentiment", "concerned"),
                    "urgency": urgency,
                })
        return flagged

    @staticmethod
    def _heuristic_classify(text: str) -> dict[str, str]:
        txt_lower = text.lower()
        if any(w in txt_lower for w in ["help", "trampling", "crushed", "suffocating", "panic"]):
            return {"sentiment": "panic", "urgency": "high"}
        if any(w in txt_lower for w in ["can't breathe", "packed", "bottleneck", "blocked", "pushing"]):
            return {"sentiment": "distress", "urgency": "high"}
        if any(w in txt_lower for w in ["lines", "long", "heat", "waiting", "slow"]):
            return {"sentiment": "concerned", "urgency": "medium"}
        return {"sentiment": "calm", "urgency": "low"}


if __name__ == "__main__":
    import json

    logging.basicConfig(level=logging.INFO)

    print("=" * 60)
    print("  CrowdShield SentimentAnalyzer — Standalone Quick Check")
    print("=" * 60)

    posts = generate_mock_social_posts()
    analyzer = SentimentAnalyzer()

    try:
        res = analyzer.analyze_posts(posts)
        print(f"\n  [OK] Posts Analyzed: {res['posts_analyzed']}")
        print(f"  [OK] Aggregated Unrest Score: {res['aggregated_unrest_score']}")
        print(f"  [OK] Flagged Posts Count: {len(res['flagged_posts'])}\n")
        print(json.dumps(res, indent=2))
    except Exception as err:
        print(f"\n  [FAIL] Analysis failed: {err}")
