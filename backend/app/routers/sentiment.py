"""
Social Media Sentiment & Crowd Unrest Router for CrowdShield Backend.

Provides social media unrest analysis and high-urgency post flagging for the command dashboard.
"""

import time
import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor
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

# Dedicated executor so polling doesn't exhaust the default asyncio thread pool
sentiment_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="sentiment_pool")

@router.get(
    "",
    response_model=Dict[str, Any],
    summary="Get aggregated crowd sentiment and unrest score",
)
async def get_sentiment_analysis(
    force: bool = False,
    refresh: bool = False,
) -> Dict[str, Any]:
    """
    Analyzes simulated social media posts to generate an aggregated unrest score (0.0 - 1.0)
    and list high-urgency flagged posts. Cached for 60 seconds unless force=True.
    """
    now = time.time()
    last_fetched = _sentiment_cache.get("timestamp", 0.0)
    cached_data = _sentiment_cache.get("data")

    should_refresh = force or refresh or cached_data is None or (now - last_fetched) >= CACHE_TTL_SECONDS

    if not should_refresh and cached_data is not None:
        logger.debug("Returning cached sentiment analysis data.")
        return cached_data

    logger.info("Running fresh sentiment analysis on mock social feed (force=%s).", force or refresh)
    mock_posts = generate_mock_social_posts()
    
    loop = asyncio.get_running_loop()
    try:
        fresh_data = await loop.run_in_executor(
            sentiment_executor,
            genai_pipeline.sentiment_analyzer.analyze_posts,
            mock_posts
        )
    except Exception as e:
        logger.warning(f"Sentiment analysis fallback on error: {e}")
        fresh_data = genai_pipeline.sentiment_analyzer._heuristic_analysis(mock_posts)

    _sentiment_cache["timestamp"] = now
    _sentiment_cache["data"] = fresh_data
    return fresh_data

    return fresh_data
