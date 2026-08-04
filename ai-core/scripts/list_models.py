import os

try:
    # Some linters/IDEs may not resolve the google.generativeai package even when
    # it's installed. Use a guarded import and fall back to importlib to help
    # satisfy runtime import while keeping static analyzers from erroring.
    import google.generativeai as genai  # type: ignore
except Exception:  # noqa: BLE001
    import importlib

    genai = importlib.import_module("google.generativeai")  # type: ignore
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

for m in genai.list_models():
    if "generateContent" in m.supported_generation_methods:
        print(m.name)
