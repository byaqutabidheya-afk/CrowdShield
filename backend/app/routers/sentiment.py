"""
Social Media Sentiment & Crowd Unrest Router for CrowdShield Backend.

Provides social media unrest analysis and high-urgency post flagging for the command dashboard.
"""

import time
import logging
from typing import Any, Dict
from fastapi import APIRouter

from ai_core.genai_pipeline.scripts.pipeline import GenAIPipeline
from ai_core.genai_pipeline.scripts.sentiment_analysis import generate_mock_social_posts

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sentiment", tags=["Sentiment Analysis"])

genai_pipeline = GenAIPipeline()

# In-memory cache: timestamp_seconds and cached data payload
_sentiment_cache: Dict[str, Any] = {"timestamp": 0.0, "data": None}
CACHE_TTL_SECONDS: float = 60.0


@router.get(
    "",
    response_model=Dict[str, Any],
    summary="Get aggregated crowd sentiment and unrest score",
)
async def get_sentiment_analysis() -> Dict[str, Any]:
    """
    Analyzes simulated social media posts to generate an aggregated unrest score (0.0 - 1.0)
    and list high-urgency flagged posts. Cached for 60 seconds to prevent LLM API rate-limiting.
    """
    now = time.time()
    last_fetched = _sentiment_cache.get("timestamp", 0.0)
    cached_data = _sentiment_cache.get("data")

    if cached_data is not None and (now - last_fetched) < CACHE_TTL_SECONDS:
        logger.debug("Returning cached sentiment analysis data.")
        return cached_data

    logger.info("Cache expired or empty. Running fresh sentiment analysis on mock social feed.")
    mock_posts = generate_mock_social_posts()
    fresh_data = genai_pipeline.sentiment_analyzer.analyze_posts(mock_posts)

    _sentiment_cache["timestamp"] = now
    _sentiment_cache["data"] = fresh_data

    return fresh_data
