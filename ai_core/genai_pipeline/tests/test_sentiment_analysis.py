#!/usr/bin/env python3
"""
test_sentiment_analysis.py — Unit tests for SentimentAnalyzer and mock dataset generation.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from sentiment_analysis import (
    SentimentAnalyzer,
    generate_mock_social_posts,
)
from llm_client import LLMClientError


def test_generate_mock_social_posts_returns_valid_data():
    posts = generate_mock_social_posts()

    assert isinstance(posts, list)
    assert 10 <= len(posts) <= 15
    for post in posts:
        assert "text" in post
        assert "platform" in post
        assert "timestamp" in post
        assert post["platform"] in ("X", "Instagram")


def test_compute_aggregated_unrest_score_known_values():
    classifications = [
        {"sentiment": "panic", "urgency": "high"},      # 1.0
        {"sentiment": "distress", "urgency": "high"},   # 0.7
        {"sentiment": "concerned", "urgency": "medium"},# 0.4
        {"sentiment": "calm", "urgency": "low"},        # 0.0
    ]
    # Sum = 1.0 + 0.7 + 0.4 + 0.0 = 2.1
    # Avg = 2.1 / 4 = 0.525 -> rounded 0.53 or 0.52

    score = SentimentAnalyzer.compute_aggregated_unrest_score(classifications)
    assert score == 0.53


def test_flagged_posts_filtering():
    posts = [
        {"text": "Post 1 (panic)", "platform": "X"},
        {"text": "Post 2 (calm)", "platform": "Instagram"},
        {"text": "Post 3 (concerned)", "platform": "X"},
    ]

    mock_client = MagicMock()
    mock_client.generate_json.return_value = {
        "analyses": [
            {"index": 0, "sentiment": "panic", "urgency": "high"},
            {"index": 1, "sentiment": "calm", "urgency": "low"},
            {"index": 2, "sentiment": "concerned", "urgency": "medium"},
        ]
    }

    analyzer = SentimentAnalyzer(llm_client=mock_client)
    res = analyzer.analyze_posts(posts)

    assert res["posts_analyzed"] == 3
    assert res["aggregated_unrest_score"] == 0.47  # (1.0 + 0.0 + 0.4) / 3 = 0.4666 -> 0.47
    assert len(res["flagged_posts"]) == 2  # Post 1 (high) and Post 3 (medium)
    assert res["flagged_posts"][0]["text"] == "Post 1 (panic)"
    assert res["flagged_posts"][0]["urgency"] == "high"
    assert res["flagged_posts"][1]["text"] == "Post 3 (concerned)"
    assert res["flagged_posts"][1]["urgency"] == "medium"


def test_fallback_on_llm_failure():
    posts = [
        {"text": "Emergency! People are suffocating in the corridor!", "platform": "X"},
        {"text": "Nice weather today at the concert.", "platform": "Instagram"},
    ]

    mock_client = MagicMock()
    mock_client.generate_json.side_effect = LLMClientError("LLM offline")

    analyzer = SentimentAnalyzer(llm_client=mock_client)
    res = analyzer.analyze_posts(posts)

    assert res["posts_analyzed"] == 2
    assert len(res["flagged_posts"]) == 1
    assert "suffocating" in res["flagged_posts"][0]["text"]
    assert res["flagged_posts"][0]["urgency"] == "high"
