"""
Main FastAPI Application Entry Point for CrowdShield Backend.

Wires together all REST routers, WebSocket endpoints, CORS middleware,
and background services (OpenWeatherMap polling).
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables
load_dotenv()

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("crowdshield.backend")

# Import API routers
from app.routers import (
    announcements,
    devices,
    incidents,
    interventions,
    sentiment,
    simulations,
    trends,
    video_control,
    voice,
    webhooks,
    zones,
)
from app.services import weather_service
from app.websockets import routes as websocket_routes


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifecycle context manager handling startup background tasks and shutdown cleanup.
    """
    logger.info("Initializing CrowdShield Backend Services...")

    # Start background weather polling task if API key is provided
    api_key = os.getenv("OPENWEATHERMAP_API_KEY", "")
    lat = float(os.getenv("VENUE_LAT", "20.34472597223267"))
    lon = float(os.getenv("VENUE_LON", "85.80678043814832"))
    poll_interval = int(os.getenv("WEATHER_POLL_INTERVAL_SECONDS", "600"))

    logger.info(f"[WEATHER CONFIG] Resolved demo venue coordinates: VENUE_LAT={lat}, VENUE_LON={lon}")

    weather_task = None
    if api_key:
        logger.info(f"Starting background weather polling task for venue ({lat}, {lon})...")
        weather_task = asyncio.create_task(
            weather_service.poll_weather(
                lat=lat, lon=lon, api_key=api_key, interval_seconds=poll_interval
            )
        )
    else:
        logger.warning(
            "OPENWEATHERMAP_API_KEY missing in environment. Weather polling task skipped."
        )

    yield  # Application runs here

    logger.info("Shutting down CrowdShield Backend Services...")
    if weather_task and not weather_task.done():
        weather_task.cancel()
        try:
            await weather_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="CrowdShield Backend API",
    description=(
        "AI-Powered Early Warning & Crowd Safety System Backend Orchestration Layer. "
        "Provides REST endpoints, WebSocket live feed streaming, and external integrations."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# CORS Configuration
allowed_origins_env = os.getenv("CORS_ORIGINS", "")
allowed_origins = [
    "http://localhost:5173",   # Vite dev dashboard
    "http://localhost:3000",   # Next/React dashboard
    "http://localhost:8081",   # Expo React Native
    "http://localhost:19006",  # Expo Web
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]

if allowed_origins_env:
    for origin in allowed_origins_env.split(","):
        o = origin.strip()
        if o and o not in allowed_origins:
            allowed_origins.append(o)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",  # Production Vercel preview & deployment origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all API & WebSocket Routers
app.include_router(incidents.router)
app.include_router(simulations.router)
app.include_router(trends.router)
app.include_router(zones.router)
app.include_router(announcements.router)
app.include_router(voice.router)
app.include_router(sentiment.router)
app.include_router(webhooks.router)
app.include_router(interventions.router)
app.include_router(devices.router)
app.include_router(video_control.router)
app.include_router(websocket_routes.router)


@app.get("/", tags=["Health"])
@app.get("/health", tags=["Health"])
async def health_check() -> dict:
    """
    Health check endpoint for Render/Railway deployment readiness probes.
    """
    return {
        "status": "ok",
        "service": "CrowdShield Backend API",
        "version": "1.0.0",
        "weather_risk_multiplier": weather_service.get_weather_risk_multiplier(),
    }
