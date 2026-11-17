from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy import create_engine, Column, String
from sqlalchemy.orm import declarative_base, Session
from pydantic import BaseModel
from supabase import create_client, ClientOptions

# 1. psycopg3 드라이버 명시
DATABASE_URL = "postgresql+psycopg://postgres.qbbuzeigxvrfzuodcerm:ZoVF2tqfEoLhlURI@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
engine = create_engine(DATABASE_URL)
Base = declarative_base()

SUPABASE_URL = "https://qbbuzeigxvrfzuodcerm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiYnV6ZWlneHZyZnp1b2RjZXJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3OTU1NTYsImV4cCI6MjExMDM3MTU1Nn0.-GTMkAVjwhYbRXb1lBPiurA_FzVlAS78i0EMefQ6TJM"

# 2. supabase 변수에 클라이언트 할당
supabase = create_client(SUPABASE_URL, SUPABASE_KEY, options=ClientOptions(flow_type="pkce"))


# 3. Supabase Auth의 user.id는 UUID 문자열이므로 id를 String으로 변경
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


# 테이블이 없으면 생성
Base.metadata.create_all(bind=engine)


# 요청마다 세션을 열고, 끝나면 닫는 함수
def get_db():
    db = Session(bind=engine)
    try:
        yield db
    finally:
        db.close()


app = FastAPI()


@app.get("/")
def read_home():
    return {
        "hello": "world"
    }


def save_profile(db: Session, user, username, provider):
    profile = db.get(Profile, str(user.id))
    if profile is None:
        # 4. 생성한 Profile 객체를 profile 변수에 대입
        profile = Profile(id=str(user.id), email=user.email, username=username, provider=provider)
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