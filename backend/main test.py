import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, String
from sqlalchemy.orm import declarative_base, Session
from pydantic import BaseModel
from supabase import create_client, ClientOptions

from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import RedirectResponse

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
load_dotenv(ROOT_DIR / ".env")
load_dotenv(BASE_DIR / ".env", override=True)

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
Base = declarative_base()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY, options=ClientOptions(flow_type="pkce"))


class Profile(Base):
    __tablename__ = "profiles"
    id = Column(String, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True)
    email = Column(String(120))
    provider = Column(String(50))


class EmailForm(BaseModel):
    username: str
    email: str
    password: str


class LoginForm(BaseModel):
    email: str
    password: str


Base.metadata.create_all(bind=engine)


def get_db():
    db = Session(bind=engine)
    try:
        yield db
    finally:
        db.close()


app = FastAPI()

# React 등 프론트엔드 연동을 위한 CORS 미들웨어 등록
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_home():
    return {"hello": "world"}


def save_profile(db: Session, user, username, provider):
    profile = db.get(Profile, str(user.id))
    if profile is None:
        profile = Profile(
            id=str(user.id),
            email=user.email,
            username=username,
            provider=provider
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


@app.post("/signup")
def signup(form: EmailForm, db: Session = Depends(get_db)):
    try:
        res = supabase.auth.sign_up({
            "email": form.email,
            "password": form.password
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if res.user is None:
        raise HTTPException(status_code=400, detail="회원가입에 실패했습니다.")

    profile = save_profile(db, res.user, form.username, "email")
    return {
        "id": profile.id,
        "email": profile.email,
        "username": profile.username
    }


@app.post("/login")
def login(form: LoginForm):
    try:
        res = supabase.auth.sign_in_with_password({
            "email": form.email,
            "password": form.password
        })
    except Exception:
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 잘못되었습니다.")

    if res.session is None:
        raise HTTPException(status_code=401, detail="로그인에 실패했거나 이메일 인증이 필요합니다.")

    return {
        "access_token": res.session.access_token
    }


@app.get("/profiles")
def read_profiles(db: Session = Depends(get_db)):
    profiles = db.query(Profile).all()
    return [
        {
            "id": profile.id,
            "email": profile.email,
            "username": profile.username,
            "provider": profile.provider
        } for profile in profiles
    ]


bearer = HTTPBearer()


@app.get("/me")
def me(cred: HTTPAuthorizationCredentials = Depends(bearer), db: Session = Depends(get_db)):
    try:
        user = supabase.auth.get_user(cred.credentials).user
    except Exception:
        raise HTTPException(status_code=401, detail="토큰이 잘못되었습니다.")

    profile = db.get(Profile, str(user.id))
    if profile is None:
        raise HTTPException(status_code=404, detail="프로필을 찾을 수 없습니다.")

    return {
        "id": profile.id,
        "username": profile.username,
        "email": profile.email,
        "provider": profile.provider
    }


# 구글 로그인
@app.get("/login/google")
def login_google():
    res = supabase.auth.sign_in_with_oauth({
        "provider": "google",
        "options": {
            "redirect_to": "http://127.0.0.1:8000/auth/callback",
            "query_params": {
                "access_type": "offline",
                "prompt": "consent",
            }
        }
    })
    return RedirectResponse(res.url)


# 카카오 로그인 시작
@app.get("/login/kakao")
def login_kakao():
    res = supabase.auth.sign_in_with_oauth({
        "provider": "kakao",
        "options": {
            "redirect_to": "http://127.0.0.1:8000/auth/callback",
            "scopes": "profile_nickname"
            }
    

    })
    return RedirectResponse(res.url)


# 카카오 로그인 콜백 처리
@app.get("/auth/callback")
def auth_callback(code: str, db: Session = Depends(get_db)):
    try:
        res = supabase.auth.exchange_code_for_session({"auth_code": code})
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"카카오 인증 코드 교환 실패: {str(e)}")

    user = res.user
    raw_name = user.user_metadata.get("name") or user.user_metadata.get("preferred_username") or "kakao_user"
    # username unique 제약조건 충돌 방지를 위해 UUID 앞 6자리 조합
    unique_username = f"{raw_name}_{str(user.id)[:6]}"

    profile = save_profile(db, user, unique_username, "kakao")
    return {
        "access_token": res.session.access_token,
        "id": profile.id,
        "username": profile.username,
        "email": profile.email,
        "provider": profile.provider
    }