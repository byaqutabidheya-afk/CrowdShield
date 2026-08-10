Setup a .venv environment: python -m venv .venv
Activate Environment: .venv\Scripts\Activate.ps1
Install Environment Dependencies: ./setup_python_env.sh
Run CV pipeline locally and save results:  python D:\CrowdShield\ai_core\cv_pipeline\scripts\pipeline.py --video D:\CrowdShield\ai_core\cv_pipeline\sample_videos\anomaly.mp4 --zones 3x3 --output results.json 
To see the last 10 commits: git log --oneline -n 10
To restore your repo to a safe-commit state: git reset --hard <commit-hash>