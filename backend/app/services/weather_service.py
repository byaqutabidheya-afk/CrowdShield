"""
OpenWeatherMap Polling & Weather Risk Service for CrowdShield.

Polls OpenWeatherMap API in a background loop for adverse weather (rain, storm, snowfall, squall).
Sets a module-level `weather_risk_multiplier` (default 1.0, 1.15 in adverse weather)
and broadcasts proactive weather alerts via WebSockets when weather shifts to adverse.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional
import httpx

from app.websockets.manager import manager

logger = logging.getLogger(__name__)

# Global weather risk multiplier and state
weather_risk_multiplier: float = 1.0
_is_adverse_weather: bool = False
_current_weather_info: Dict[str, Any] = {}

ADVERSE_WEATHER_MULTIPLIER: float = 1.15
STANDARD_WEATHER_MULTIPLIER: float = 1.0

# Weather condition types considered adverse
ADVERSE_MAIN_CONDITIONS = {
    "Rain",
    "Thunderstorm",
    "Drizzle",
    "Snow",
    "Squall",
    "Tornado",
}


def get_weather_risk_multiplier() -> float:
    """
    Returns the current weather risk multiplier (1.0 default, 1.15 during adverse weather).
    """
    return weather_risk_multiplier


def get_weather_state() -> Dict[str, Any]:
    """
    Returns the current weather state dictionary.
    """
    return {
        "weather_risk_multiplier": weather_risk_multiplier,
        "is_adverse_weather": _is_adverse_weather,
        "details": _current_weather_info,
    }


def is_adverse_weather_condition(weather_data: Dict[str, Any]) -> bool:
    """
    Evaluates OpenWeatherMap payload to check for adverse weather conditions.
    """
    weather_list = weather_data.get("weather", [])
    for w in weather_list:
        main_cond = w.get("main", "")
        code = w.get("id", 800)
        if main_cond in ADVERSE_MAIN_CONDITIONS or (code < 800):
            return True
    return False


async def poll_weather(
    lat: float,
    lon: float,
    api_key: str,
    interval_seconds: int = 600,
) -> None:
    """
    Background polling loop querying OpenWeatherMap current weather API.

    :param lat: Venue latitude
    :param lon: Venue longitude
    :param api_key: OpenWeatherMap API key
    :param interval_seconds: Polling frequency in seconds (default 600 = 10 minutes)
    """
    global weather_risk_multiplier, _is_adverse_weather, _current_weather_info

    if not api_key:
        logger.warning("OPENWEATHERMAP_API_KEY is missing. Weather polling task will not run.")
        return

    url = "https://api.openweathermap.org/data/2.5/weather"
    params = {"lat": lat, "lon": lon, "appid": api_key, "units": "metric"}

    logger.info(f"Starting weather polling task for ({lat}, {lon}) every {interval_seconds}s.")

    async with httpx.AsyncClient(timeout=10.0) as client:
        while True:
            try:
                response = await client.get(url, params=params)
                if response.status_code == 200:
                    data = response.json()
                    weather_elements = data.get("weather", [{}])
                    _current_weather_info = {
                        "main": weather_elements[0].get("main") if weather_elements else None,
                        "description": weather_elements[0].get("description") if weather_elements else None,
                        "temp_c": data.get("main", {}).get("temp"),
                        "humidity": data.get("main", {}).get("humidity"),
                        "wind_speed": data.get("wind", {}).get("speed"),
                        "city": data.get("name"),
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }

                    adverse = is_adverse_weather_condition(data)
                    previous_adverse = _is_adverse_weather
                    _is_adverse_weather = adverse

                    if adverse:
                        weather_risk_multiplier = ADVERSE_WEATHER_MULTIPLIER
                        logger.warning(
                            f"Adverse weather detected ({_current_weather_info.get('description')}). "
                            f"Setting risk multiplier to {ADVERSE_WEATHER_MULTIPLIER}."
                        )

                        # Trigger proactive risk alert on state shift to adverse
                        if not previous_adverse:
                            alert_payload = {
                                "type": "weather_alert",
                                "alert_source": "weather",
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                                "risk_level": "warning",
                                "weather_risk_multiplier": ADVERSE_WEATHER_MULTIPLIER,
                                "message": (
                                    f"Adverse weather condition detected ({_current_weather_info.get('description')}). "
                                    f"Applying {ADVERSE_WEATHER_MULTIPLIER}x risk multiplier to outdoor zones."
                                ),
                                "weather_details": _current_weather_info,
                            }
                            logger.info("Broadcasting proactive weather alert via WebSockets.")
                            await manager.broadcast(alert_payload)
                    else:
                        weather_risk_multiplier = STANDARD_WEATHER_MULTIPLIER
                        if previous_adverse:
                            logger.info("Weather cleared. Resetting risk multiplier to 1.0.")

                else:
                    logger.warning(
                        f"OpenWeatherMap API request failed status={response.status_code}: {response.text}"
                    )

            except asyncio.CancelledError:
                logger.info("Weather polling task cancelled.")
                break
            except Exception as e:
                logger.error(f"Error during weather polling loop: {e}")

            await asyncio.sleep(interval_seconds)
