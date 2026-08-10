"""
Test Suite for CrowdShield FastAPI Routers.

Uses FastAPI's TestClient with mocked Supabase and AI pipeline calls to verify
endpoint status codes, response schemas, and Pydantic 422 validation behavior offline.
"""

import io
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# Ensure backend directory is in sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.main import app

client = TestClient(app)


# ------------------------------------------------------------------------------
# Health Check Tests
# ------------------------------------------------------------------------------
def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "service" in data


# ------------------------------------------------------------------------------
# Incident Reports Router Tests
# ------------------------------------------------------------------------------
@patch("app.services.supabase_client.insert_incident_report")
def test_create_incident_report_valid(mock_insert):
    mock_insert.return_value = {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "source": "citizen",
        "zone_id": "zone_A1",
        "notes": "Medical emergency near food court",
        "submitted_at": "2026-08-03T14:32:10Z",
    }
    payload = {
        "source": "citizen",
        "zone_id": "zone_A1",
        "notes": "Medical emergency near food court",
    }
    response = client.post("/api/incidents", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["zone_id"] == "zone_A1"


def test_create_incident_report_invalid():
    # Missing required 'notes' field
    payload = {"source": "citizen"}
    response = client.post("/api/incidents", json=payload)
    assert response.status_code == 422


@patch("app.services.supabase_client.get_incident_reports")
def test_list_incident_reports(mock_get):
    mock_get.return_value = [
        {"id": "inc_01", "source": "citizen", "notes": "Test incident 1"},
        {"id": "inc_02", "source": "ai_generated", "notes": "Test incident 2"},
    ]
    response = client.get("/api/incidents?source=citizen")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 2


# ------------------------------------------------------------------------------
# Simulations Router Tests
# ------------------------------------------------------------------------------
@patch("app.services.orchestrator.EventOrchestrator.run_pre_event_simulation")
def test_run_pre_event_simulation_valid(mock_sim):
    mock_sim.return_value = {
        "total_attendance": 1000,
        "simulated_steps": [{"step": 1, "zone_risk_scores": {"zone_A1": 0.5}}],
    }
    payload = {
        "zones": [
            {
                "zone_id": "zone_A1",
                "bounds_normalized": {"x_min": 0, "y_min": 0, "x_max": 0.5, "y_max": 0.5},
            }
        ],
        "entry_zone_ids": ["zone_A1"],
        "expected_attendance": 1000,
    }
    response = client.post("/api/simulations/pre-event", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "simulated_steps" in data


def test_run_pre_event_simulation_invalid():
    # Missing required 'expected_attendance'
    payload = {"zones": [], "entry_zone_ids": ["zone_A1"]}
    response = client.post("/api/simulations/pre-event", json=payload)
    assert response.status_code == 422


# ------------------------------------------------------------------------------
# Trends Router Tests
# ------------------------------------------------------------------------------
@patch("app.services.supabase_client.get_trend_data")
def test_get_zone_trends(mock_trends):
    mock_trends.return_value = [
        {
            "timestamp": "2026-08-03T14:00:00Z",
            "density_score": 0.65,
            "risk_score": 0.45,
            "crowd_count": 35,
            "avg_flow_speed": 0.5,
            "risk_level": "moderate",
        }
    ]
    response = client.get("/api/trends/zone_A1")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["density_score"] == 0.65


# ------------------------------------------------------------------------------
# Zones & Routes Router Tests
# ------------------------------------------------------------------------------
@patch("app.services.supabase_client.get_zone_config")
def test_get_zones(mock_get_zones):
    mock_get_zones.return_value = [
        {
            "zone_id": "zone_A1",
            "venue_id": "venue_01",
            "bounds_normalized": {"x_min": 0, "y_min": 0, "x_max": 0.5, "y_max": 0.5},
        }
    ]
    response = client.get("/api/zones?venue_id=venue_01")
    assert response.status_code == 200
    assert len(response.json()) == 1


@patch("app.services.supabase_client.upsert_zone_config")
def test_upsert_zones(mock_upsert):
    mock_upsert.return_value = [{"zone_id": "zone_A1", "is_exit": True}]
    payload = [
        {
            "zone_id": "zone_A1",
            "venue_id": "venue_01",
            "bounds_normalized": {"x_min": 0, "y_min": 0, "x_max": 0.5, "y_max": 0.5},
            "is_exit": True,
        }
    ]
    response = client.post("/api/zones", json=payload)
    assert response.status_code == 200
    assert response.json()[0]["is_exit"] is True


def test_get_routes():
    response = client.get("/api/routes?venue_id=cam_01")
    assert response.status_code == 200
    data = response.json()
    assert "route_blockage_predictions" in data


# ------------------------------------------------------------------------------
# Announcements Router Tests
# ------------------------------------------------------------------------------
@patch("ai_core.genai_pipeline.scripts.translation_tts.MultilingualAnnouncer.create_multilingual_alert")
@patch("app.services.supabase_client.insert_intervention")
def test_create_announcement_valid(mock_insert_interv, mock_alert):
    mock_alert.return_value = {
        "base_message_en": "Please move calmly to Exit B",
        "translations": {"hi": {"text": "हिंदी अनुवाद", "audio_path": "audio/hi.mp3"}},
    }
    payload = {
        "base_message_en": "Please move calmly to Exit B",
        "zone_id": "zone_A1",
        "post_to_social": True,
    }
    response = client.post("/api/announcements", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "translations" in data
    assert "social_channels" in data


def test_create_announcement_invalid():
    # Missing required 'base_message_en'
    payload = {"post_to_social": True}
    response = client.post("/api/announcements", json=payload)
    assert response.status_code == 422


# ------------------------------------------------------------------------------
# Voice Commands Router Tests
# ------------------------------------------------------------------------------
@patch("ai_core.genai_pipeline.scripts.voice_commands.VoiceCommandProcessor.process_voice_command")
def test_process_voice_command(mock_voice):
    mock_voice.return_value = {
        "transcribed_text": "show me zone A1",
        "matched_intent": "navigate_to_zone",
        "intent_params": {"zone_id": "zone_A1"},
        "confidence": "high",
    }
    dummy_wav = io.BytesIO(b"RIFF....WAVEfmt ....data....")
    response = client.post(
        "/api/voice-command",
        files={"file": ("test_command.wav", dummy_wav, "audio/wav")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["matched_intent"] == "navigate_to_zone"


# ------------------------------------------------------------------------------
# Sentiment Router Tests
# ------------------------------------------------------------------------------
@patch("ai_core.genai_pipeline.scripts.sentiment_analysis.SentimentAnalyzer.analyze_posts")
def test_get_sentiment_analysis(mock_sentiment):
    mock_sentiment.return_value = {
        "analyzed_at": "2026-08-03T14:00:00Z",
        "posts_analyzed": 12,
        "aggregated_unrest_score": 0.64,
        "flagged_posts": [],
    }
    response = client.get("/api/sentiment")
    assert response.status_code == 200
    data = response.json()
    assert "aggregated_unrest_score" in data


# ------------------------------------------------------------------------------
# Webhooks Router Tests
# ------------------------------------------------------------------------------
@patch("app.services.supabase_client.insert_intervention")
def test_update_digital_signage_valid(mock_insert_interv):
    payload = {
        "zone_id": "zone_A1",
        "message": "Use Exit B for main parking",
        "direction_arrows": ["N", "NE"],
    }
    response = client.post("/api/webhooks/signage", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "simulated_dispatch"
    assert data["zone_id"] == "zone_A1"


def test_update_digital_signage_invalid():
    # Missing required 'zone_id' and 'message'
    payload = {}
    response = client.post("/api/webhooks/signage", json=payload)
    assert response.status_code == 422


# ------------------------------------------------------------------------------
# Interventions Router Tests
# ------------------------------------------------------------------------------
@patch("app.services.supabase_client.insert_intervention")
def test_create_intervention_valid(mock_insert):
    mock_insert.return_value = {
        "id": "int_01",
        "zone_id": "zone_A1",
        "action_taken": "Repositioned security team to Gate 3",
        "category": "manual",
        "triggered_by": "operator",
    }
    payload = {
        "zone_id": "zone_A1",
        "action_taken": "Repositioned security team to Gate 3",
        "category": "manual",
    }
    response = client.post("/api/interventions", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["category"] == "manual"


def test_create_intervention_invalid():
    # Missing required 'action_taken' and 'zone_id'
    payload = {}
    response = client.post("/api/interventions", json=payload)
    assert response.status_code == 422


@patch("app.services.supabase_client.get_supabase_client")
def test_list_interventions(mock_get_client):
    mock_supabase = MagicMock()
    mock_query = MagicMock()
    mock_query.select.return_value = mock_query
    mock_query.eq.return_value = mock_query
    mock_query.order.return_value = mock_query
    mock_query.execute.return_value = MagicMock(
        data=[{"id": "int_01", "zone_id": "zone_A1", "action_taken": "Test action"}]
    )
    mock_supabase.table.return_value = mock_query
    mock_get_client.return_value = mock_supabase

    response = client.get("/api/interventions?zone_id=zone_A1")
    assert response.status_code == 200
    assert len(response.json()) == 1


# ------------------------------------------------------------------------------
# Devices Router Tests
# ------------------------------------------------------------------------------
@patch("app.services.supabase_client.get_supabase_client")
def test_register_device_valid(mock_get_client):
    mock_supabase = MagicMock()
    mock_query = MagicMock()
    mock_query.upsert.return_value = mock_query
    mock_query.execute.return_value = MagicMock(data=[])
    mock_supabase.table.return_value = mock_query
    mock_get_client.return_value = mock_supabase

    payload = {
        "push_token": "fcm_token_1234567890",
        "last_known_location": {"latitude": 28.6139, "longitude": 77.2090},
    }
    response = client.post("/api/devices/register", json=payload)
    assert response.status_code == 204


def test_register_device_invalid():
    # Missing required 'push_token'
    payload = {"last_known_location": {"latitude": 28.6139, "longitude": 77.2090}}
    response = client.post("/api/devices/register", json=payload)
    assert response.status_code == 422


# ------------------------------------------------------------------------------
# Processing Control Router Tests
# ------------------------------------------------------------------------------
@patch("app.services.supabase_client.get_zone_config")
def test_start_processing_valid(mock_zones):
    mock_zones.return_value = [{"zone_id": "zone_A1"}]
    payload = {
        "video_source": "demo/sample.mp4",
        "venue_id": "cam_01",
        "sample_every_n_frames": 3,
    }
    response = client.post("/api/processing/start", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "session_id" in data
    assert data["status"] in ("started", "already_running")


def test_stop_processing():
    response = client.post("/api/processing/stop")
    assert response.status_code == 200
    assert response.json()["status"] == "stopped"


def test_get_processing_status():
    response = client.get("/api/processing/status")
    assert response.status_code == 200
    data = response.json()
    assert "is_active" in data
    assert "frames_processed" in data
    assert "max_risk_score_seen" in data
    assert "active_alert_count" in data
