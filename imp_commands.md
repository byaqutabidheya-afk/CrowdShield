Setup a .venv environment: python -m venv .venv
Activate Environment: .venv\Scripts\Activate.ps1
Install Environment Dependencies: ./setup_python_env.sh
Run CV pipeline locally and save results: python pipeline.py --video path/to/your/video.mp4 --zones path/to/your_zones.json --output path/to/results.json
