import os

import google.generativeai as genai  # type: ignore
from dotenv import load_dotenv

load_dotenv()  # reads .env from the current directory

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-3.6-flash")
response = model.generate_content("Say hello world in exactly 3 words.")
print(response.text)
