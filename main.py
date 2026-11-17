from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import declarative_base, Session
from pydantic import BaseModel

DATABASE_URL = "postgresql://postgres.qbbuzeigxvrfzuodcerm:ZoVF2tqfEoLhlURI@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"

engine = create_engine(DATABASE_URL)
Base = declarative_base()

# 테이블 모델(테이블 이름을 users)
class Profile(Base):
    __tablename__ = "profiles"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True)
    email = Column(String(120))
    provider = Column(String(50))

class EmailForm(BaseModel):
    username: str
    email: str
    provider : str

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
        "hello" : "world"
    }