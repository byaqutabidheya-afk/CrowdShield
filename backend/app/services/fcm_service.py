"""
Firebase Cloud Messaging (FCM) Push Notification Service for CrowdShield Backend.

Wrapper around firebase-admin SDK to send push alerts to all registered mobile devices.
"""

import os
import json
import logging
from typing import Any, Dict, Optional
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

_fcm_initialized: bool = False


def _init_firebase_admin() -> bool:
    """
    Initializes firebase_admin SDK using service account JSON path or inline JSON string.
    """
    global _fcm_initialized
    if _fcm_initialized:
        return True

    try:
        import firebase_admin
        from firebase_admin import credentials

        if firebase_admin._apps:
            _fcm_initialized = True
            return True

        service_account_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
        firebase_json_str = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")

        cred = None
        if service_account_path and os.path.exists(service_account_path):
            logger.info(
                f"Initializing Firebase Admin from service account file: {service_account_path}"
            )
            cred = credentials.Certificate(service_account_path)
        elif firebase_json_str and firebase_json_str.strip():
            try:
                cred_dict = json.loads(firebase_json_str)
                logger.info(
                    "Initializing Firebase Admin from FIREBASE_SERVICE_ACCOUNT_JSON string."
                )
                cred = credentials.Certificate(cred_dict)
            except Exception as json_err:
                logger.warning(
                    f"Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON: {json_err}"
                )

        if cred:
            firebase_admin.initialize_app(cred)
            _fcm_initialized = True
            logger.info("Firebase Admin SDK successfully initialized.")
            return True
        else:
            logger.warning(
                "Firebase credentials missing (FIREBASE_SERVICE_ACCOUNT_PATH / FIREBASE_SERVICE_ACCOUNT_JSON). "
                "FCM push notifications will run in mock/log-only mode."
            )
            return False

    except Exception as e:
        logger.error(f"Error initializing Firebase Admin SDK: {e}")
        return False


async def send_push_to_all_devices(
    title: str, body: str, data: Optional[Dict[str, Any]] = None
) -> None:
    """
    Fetches all registered push tokens from `devices` table and sends a multicast FCM notification.
    Logs per-token failures without raising exceptions so invalid tokens don't crash alert loops.
    """
    logger.info(f"[FCM Push] Preparing push alert: title='{title}', body='{body}'")

    from app.services import supabase_client

    client = supabase_client.get_supabase_client()
    if not client:
        logger.warning(
            "[FCM Push] Supabase client uninitialized. Skipping push delivery."
        )
        return

    # 1. Fetch registered tokens from Supabase `devices` table
    try:
        response = client.table("devices").select("push_token").execute()
        device_rows = response.data or []
        tokens = [row.get("push_token") for row in device_rows if row.get("push_token")]
    except Exception as e:
        logger.error(f"[FCM Push] Error fetching tokens from devices table: {e}")
        return

    if not tokens:
        logger.info("[FCM Push] No registered device tokens found in devices table.")
        return

    # 2. Check Firebase Admin initialization
    if not _init_firebase_admin():
        logger.warning(
            f"[FCM Mock Log] Push notification would send to {len(tokens)} devices: "
            f"title='{title}', body='{body}', data={data}"
        )
        return

    # 3. Send multicast push via firebase_admin.messaging
    try:
        from firebase_admin import messaging

        string_data = {str(k): str(v) for k, v in (data or {}).items()}

        message = messaging.MulticastMessage(
            notification=messaging.Notification(title=title, body=body),
            data=string_data,
            tokens=tokens,
        )

        batch_response = messaging.send_each_for_multicast(message)
        logger.info(
            f"[FCM Push Success] Sent {batch_response.success_count}/{len(tokens)} push notifications."
        )

        if batch_response.failure_count > 0:
            for idx, resp in enumerate(batch_response.responses):
                if not resp.success:
                    token_snippet = tokens[idx][:10] if idx < len(tokens) else "unknown"
                    logger.warning(
                        f"[FCM Push Failure] Token '{token_snippet}...' failed: {resp.exception}"
                    )

    except Exception as e:
        logger.error(f"[FCM Push Error] Exception during FCM multicast send: {e}")
