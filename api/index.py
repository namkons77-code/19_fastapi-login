import sys
import os

# root 디렉터리를 sys.path에 추가하여 backend 모듈 임포트 가능하게 설정
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from fastapi import FastAPI
from backend.main import app as backend_app

# Vercel Serverless Function 진입점
app = FastAPI(title="TheQoo Community API")

# /api 및 / 경로를 backend_app에 마운트하여 어디서든 정상 라우팅 지원
app.mount("/api", backend_app)
app.mount("/", backend_app)
