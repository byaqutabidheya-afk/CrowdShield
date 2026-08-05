"""Download and cache YOLOv8n weights for the CV pipeline.

The first run fetches the official ``yolov8n.pt`` checkpoint through
Ultralytics and copies it into this module's directory so later steps can
load it from a stable local path.
"""

from __future__ import annotations

import shutil
from pathlib import Path


WEIGHTS_FILENAME = "yolov8n.pt"
MODEL_DIR = Path(__file__).resolve().parent
DEFAULT_WEIGHTS_PATH = MODEL_DIR / WEIGHTS_FILENAME


def _resolve_downloaded_asset() -> Path:
    """Fetch ``yolov8n.pt`` using Ultralytics and return the downloaded path."""

    try:
        from ultralytics.utils.downloads import attempt_download_asset
    except (
        Exception
    ) as exc:  # pragma: no cover - import failure is environment-specific
        try:
            from ultralytics import YOLO
        except (
            Exception
        ) as fallback_exc:  # pragma: no cover - import failure is environment-specific
            raise RuntimeError(
                "Ultralytics is required to download yolov8n.pt. Install the package first."
            ) from fallback_exc

        model = YOLO(WEIGHTS_FILENAME)
        ckpt_path = getattr(model, "ckpt_path", None)
        if ckpt_path:
            resolved = Path(ckpt_path)
            if resolved.exists():
                return resolved
        raise RuntimeError(
            "Ultralytics loaded the model, but the checkpoint path could not be resolved."
        ) from exc

    downloaded_path = Path(attempt_download_asset(WEIGHTS_FILENAME))
    if downloaded_path.exists():
        return downloaded_path

    raise RuntimeError(
        f"Ultralytics did not return a usable checkpoint path for {WEIGHTS_FILENAME}."
    )


def download_yolov8n_weights(destination_dir: Path | str | None = None) -> Path:
    """Ensure ``yolov8n.pt`` exists in the requested directory.

    Args:
        destination_dir: Directory that should contain the cached weights.

    Returns:
        Path to the local ``yolov8n.pt`` file.
    """

    target_dir = Path(destination_dir) if destination_dir is not None else MODEL_DIR
    target_dir.mkdir(parents=True, exist_ok=True)

    target_path = target_dir / WEIGHTS_FILENAME
    if target_path.exists():
        return target_path

    source_path = _resolve_downloaded_asset()
    if source_path.resolve() != target_path.resolve():
        shutil.copy2(source_path, target_path)

    return target_path


def main() -> None:
    """Download the weights into this module's directory."""

    weights_path = download_yolov8n_weights(DEFAULT_WEIGHTS_PATH.parent)
    print(weights_path)


if __name__ == "__main__":
    main()
