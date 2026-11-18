import os
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, String, Integer, Text, DateTime, ForeignKey, desc, or_
from sqlalchemy.orm import declarative_base, Session, relationship
from pydantic import BaseModel
from supabase import create_client, ClientOptions

from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import RedirectResponse

# 0. .env 환경변수 로드 (루트 및 backend 디렉터리 순서대로 탐색)
BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent

load_dotenv(ROOT_DIR / ".env")
load_dotenv(BASE_DIR / ".env", override=True)

# 1. psycopg3 드라이버 명시 및 환경변수 로드
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL 환경변수가 설정되지 않았습니다. .env 파일을 확인해주세요.")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("SUPABASE_URL 및 SUPABASE_KEY 환경변수가 설정되지 않았습니다. .env 파일을 확인해주세요.")

engine = create_engine(DATABASE_URL)
Base = declarative_base()

# 2. supabase 변수에 클라이언트 할당
supabase = create_client(SUPABASE_URL, SUPABASE_KEY, options=ClientOptions(flow_type="pkce"))


# 3. Supabase Auth의 user.id는 UUID 문자열이므로 id를 String으로 변경
class Profile(Base):
    __tablename__ = "profiles"
    id = Column(String, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True)
    email = Column(String(120))
    provider = Column(String(50))


# 4. 더쿠(theqoo) 스타일 커뮤니티 게시판 모델
class Post(Base):
    __tablename__ = "posts"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    category = Column(String(50), default="잡담", index=True)
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    author_id = Column(String, nullable=True)
    author_name = Column(String(50), default="무명의 더쿠")
    views = Column(Integer, default=0)
    likes = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    comments = relationship("Comment", back_populates="post", cascade="all, delete-orphan", order_by="Comment.id.asc()")


class Comment(Base):
    __tablename__ = "comments"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    post_id = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    author_id = Column(String, nullable=True)
    author_name = Column(String(50), default="무명의 더쿠")
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    post = relationship("Post", back_populates="comments")


class EmailForm(BaseModel):
    username: str
    email: str
    password: str


class LoginForm(BaseModel):
    email: str
    password: str


class PostCreate(BaseModel):
    category: str = "잡담"
    title: str
    content: str
    author_name: str | None = None


class PostUpdate(BaseModel):
    category: str | None = None
    title: str | None = None
    content: str | None = None


class CommentCreate(BaseModel):
    content: str
    author_name: str | None = None


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
    return {
        "hello": "world"
    }


def save_profile(db: Session, user, username, provider):
    profile = db.get(Profile, str(user.id))
    if profile is None:
        # 소셜 로그인 시 이메일 미제공 대응
        user_email = user.email or f"{str(user.id)[:8]}@{provider}.local"
        profile = Profile(id=str(user.id), email=user_email, username=username, provider=provider)
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
    except:
        raise HTTPException(status_code=401, detail="토큰이 잘못되었습니다.")

    profile = db.get(Profile, user.id)

    if profile is None: 
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 잘못되었습니다.")

    return {
        "id": profile.id, 
        "username": profile.username, 
        "email": profile.email,
        "provider": profile.provider
    }

def get_base_url(request: Request) -> str:
    """로컬 및 Vercel 배포 환경에서 유효한 베이스 URL을 반환합니다."""
    env_site_url = os.getenv("SITE_URL") or os.getenv("VERCEL_URL")
    if env_site_url:
        return f"https://{env_site_url}" if not env_site_url.startswith("http") else env_site_url

    forwarded_host = request.headers.get("x-forwarded-host")
    forwarded_proto = request.headers.get("x-forwarded-proto", "https")
    if forwarded_host:
        return f"{forwarded_proto}://{forwarded_host}"

    origin = request.headers.get("origin")
    if origin:
        return origin

    return str(request.base_url).rstrip("/")


# 카카오 로그인
@app.get("/login/kakao")
def login_kakao(request: Request):
    base_url = get_base_url(request)
    # Vercel 배포 시 /api/auth/callback, 로컬 개발 시 /auth/callback
    redirect_to = f"{base_url}/auth/callback" if ("127.0.0.1" in base_url or "localhost" in base_url) else f"{base_url}/api/auth/callback"

    res = supabase.auth.sign_in_with_oauth({
        "provider": "kakao",
        "options": {
            "redirect_to": redirect_to,
            "scope": "profile_nickname"
        }
    })
    return RedirectResponse(res.url)


# 구글 로그인
@app.get("/login/google")
def login_google(request: Request):
    base_url = get_base_url(request)
    redirect_to = f"{base_url}/auth/callback" if ("127.0.0.1" in base_url or "localhost" in base_url) else f"{base_url}/api/auth/callback"

    res = supabase.auth.sign_in_with_oauth({
        "provider": "google",
        "options": {
            "redirect_to": redirect_to,
            "query_params": {
                "access_type": "offline",
                "prompt": "consent",
            }
        }
    })
    return RedirectResponse(res.url)


# OAuth (카카오, 구글 등) 콜백 처리
@app.get("/auth/callback")
def auth_callback(
    request: Request,
    code: str = None,
    error: str = None,
    error_description: str = None,
    format: str = "redirect",
    db: Session = Depends(get_db)
):
    if error:
        raise HTTPException(status_code=400, detail=f"OAuth 인증 실패: {error} ({error_description})")

    if not code:
        raise HTTPException(status_code=400, detail="인증 코드(code)가 전달되지 않았습니다.")

    try:
        res = supabase.auth.exchange_code_for_session({"auth_code": code})
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"OAuth 인증 코드 교환 실패: {str(e)}")

    user = res.user
    provider = user.app_metadata.get("provider") or "oauth"
    raw_name = (
        user.user_metadata.get("full_name")
        or user.user_metadata.get("name")
        or user.user_metadata.get("preferred_username")
        or f"{provider}_user"
    )
    unique_username = f"{raw_name}_{str(user.id)[:6]}"

    profile = save_profile(db, user, unique_username, provider)

    if format == "json":
        return {
            "access_token": res.session.access_token,
            "id": profile.id,
            "username": profile.username,
            "email": profile.email,
            "provider": profile.provider
        }

    # 기본: 프론트엔드로 토큰을 넘겨주며 리다이렉트 (배포 시 동일 도메인, 로컬 시 localhost:5173)
    base_url = get_base_url(request)
    frontend_url = "http://localhost:5173" if ("127.0.0.1" in base_url or "8000" in base_url) else base_url
    return RedirectResponse(
        url=f"{frontend_url}/?access_token={res.session.access_token}&username={profile.username}"
    )


# ========================================================
# 5. 더쿠(theqoo) 스타일 커뮤니티 게시판 CRUD API
# ========================================================

bearer_optional = HTTPBearer(auto_error=False)
bearer_required = HTTPBearer()


def get_current_user(
    cred: HTTPAuthorizationCredentials = Depends(bearer_required),
    db: Session = Depends(get_db)
) -> Profile:
    """CUD 작업을 위한 필수 로그인 검증 의존성"""
    try:
        user = supabase.auth.get_user(cred.credentials).user
    except Exception:
        raise HTTPException(status_code=401, detail="로그인이 필요하거나 세션이 만료되었습니다. 다시 로그인해주세요.")

    profile = db.get(Profile, str(user.id))
    if not profile:
        raise HTTPException(status_code=404, detail="사용자 프로필을 찾을 수 없습니다.")
    return profile


def get_optional_user(
    cred: HTTPAuthorizationCredentials | None = Depends(bearer_optional),
    db: Session = Depends(get_db)
):
    """토큰이 있으면 프로필을 반환하고, 없으면 None을 반환합니다."""
    if not cred:
        return None
    try:
        user = supabase.auth.get_user(cred.credentials).user
        profile = db.get(Profile, str(user.id))
        return profile
    except Exception:
        return None


def init_seed_posts(db: Session):
    """게시판이 비어있을 때 더쿠 스타일의 초기 게시글과 댓글을 생성합니다."""
    count = db.query(Post).count()
    if count == 0:
        samples = [
            ("정보", "💡 2026 풀스택 웹 개발 입문: FastAPI + React(Vite) 핵심 정리", "FastAPI는 비동기 처리와 자동 Swagger 문서화가 장점이고, Vite는 압도적인 빌드 속도를 자랑합니다.\n\nSupabase Auth를 붙이면 회원가입, JWT 로그인, 소셜 로그인(구글, 카카오)까지 손쉽게 완성할 수 있습니다!", "개발덕후", 124, 18),
            ("HOT", "🔥 [속보] 오늘 점심 특식 돈까스 vs 제육볶음 종결 났음", "더쿠 여러분의 열화와 같은 성원에 힘입어 오늘 점심 메뉴는 반반 정식으로 전격 합의되었습니다.\n\n다들 맛점하시길 바랍니다 ㅋㅋㅋ 날씨도 좋은데 커피 한잔 때려야겠네요.", "무명의 더쿠", 352, 45),
            ("후기", "☕ 리액트 개발 환경 세팅해보고 느낀 점 솔직 후기", "기존 CRA 쓰다가 Vite로 넘어왔는데 왜 이제 썼나 싶네요.\n\n저장하자마자 0.1초 만에 화면 반영되는 HMR 신세계입니다. 다들 꼭 써보세요 강추!", "프론트새싹", 88, 7),
            ("유머", "💻 야근하던 개발자가 새벽 3시에 버그 잡았을 때 표정.jpg", "알고보니 세미콜론이나 오타 하나 문제였을 때 밀려오는 현타... 나만 그런 거 아니지? ㅋㅋㅋ큐ㅠㅠ 그래도 퇴근할 수 있어서 행복합니다.", "무명의 더쿠", 215, 32),
            ("질문", "❓ 소셜 로그인할 때 카카오랑 구글 중 뭐가 더 구현하기 편해?", "이번에 프로젝트에 OAuth 연동하려고 하는데 둘 다 Supabase로 하니까 생각보다 간단하더라!\n\n다들 실무나 프로젝트에서 어떤 거 주로 선호하시나요?", "질문봇", 64, 4),
            ("잡담", "📢 더쿠 커뮤니티 게시판 오픈 기념 자유롭게 글 남겨줘!", "로그인한 유저는 본인 닉네임으로, 비로그인 상태에서는 '무명의 더쿠'로 글과 댓글을 남길 수 있습니다.\n\n자유롭게 작성, 수정, 삭제(CRUD) 및 추천 기능을 테스트해보세요!", "관리자", 420, 89),
        ]
        created_posts = []
        for cat, title, content, author, views, likes in samples:
            p = Post(
                category=cat,
                title=title,
                content=content,
                author_name=author,
                views=views,
                likes=likes
            )
            db.add(p)
            created_posts.append(p)
        db.commit()

        # 첫 번째 핫게 글에 댓글 몇 개 추가
        if len(created_posts) >= 2:
            hot_post = created_posts[1]
            comments = [
                ("무명의 더쿠 1", "ㅋㅋㅋㅋㅋㅋㅋㅋ 반반 정식 인정이지"),
                ("무명의 더쿠 2", "역시 제육과 돈까스는 우열을 가릴 수 없다..."),
                ("무명의 더쿠 3", "오늘 점심 메뉴 고민 해결 고맙다 덬아 ㅋㅋㅋ")
            ]
            for c_name, c_content in comments:
                db.add(Comment(post_id=hot_post.id, author_name=c_name, content=c_content))
            db.commit()


# 앱 시작 시 시드 데이터 확인 및 생성
with Session(bind=engine) as db_init:
    try:
        init_seed_posts(db_init)
    except Exception as e:
        print("Seed init error:", e)


# 5-1. 게시글 목록 조회 (theqoo 테이블 리스트)
@app.get("/posts")
def get_posts(
    category: str | None = None,
    keyword: str | None = None,
    page: int = 1,
    limit: int = 15,
    sort: str = "latest",
    db: Session = Depends(get_db)
):
    query = db.query(Post)

    if category and category == "HOT":
        # 핫게 기준: 추천 10 이상 또는 조회수 100 이상
        query = query.filter(or_(Post.likes >= 10, Post.views >= 100))
    elif category and category != "전체":
        query = query.filter(Post.category == category)

    if keyword and keyword.strip():
        kw = f"%{keyword.strip()}%"
        query = query.filter(
            or_(
                Post.title.ilike(kw),
                Post.content.ilike(kw),
                Post.author_name.ilike(kw)
            )
        )

    total = query.count()

    if sort == "hot" or category == "HOT":
        query = query.order_by(desc(Post.likes), desc(Post.views), desc(Post.id))
    else:
        query = query.order_by(desc(Post.id))

    posts = query.offset((page - 1) * limit).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "posts": [
            {
                "id": p.id,
                "category": p.category,
                "title": p.title,
                "author_id": p.author_id,
                "author_name": p.author_name,
                "views": p.views,
                "likes": p.likes,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "comments_count": len(p.comments)
            }
            for p in posts
        ]
    }


# 5-2. 게시글 상세 조회 (본문 + 댓글 목록 + 조회수 증가)
@app.get("/posts/{post_id}")
def get_post_detail(post_id: int, db: Session = Depends(get_db)):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")

    # 조회수 증가
    post.views += 1
    db.commit()
    db.refresh(post)

    return {
        "id": post.id,
        "category": post.category,
        "title": post.title,
        "content": post.content,
        "author_id": post.author_id,
        "author_name": post.author_name,
        "views": post.views,
        "likes": post.likes,
        "created_at": post.created_at.isoformat() if post.created_at else None,
        "comments": [
            {
                "id": c.id,
                "author_id": c.author_id,
                "author_name": c.author_name,
                "content": c.content,
                "created_at": c.created_at.isoformat() if c.created_at else None
            }
            for c in post.comments
        ]
    }


# 5-3. 게시글 작성 (Create) - 로그인 필수
@app.post("/posts")
def create_post(
    form: PostCreate,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    new_post = Post(
        category=form.category,
        title=form.title,
        content=form.content,
        author_id=str(user.id),
        author_name=user.username
    )
    db.add(new_post)
    db.commit()
    db.refresh(new_post)

    return {
        "id": new_post.id,
        "category": new_post.category,
        "title": new_post.title,
        "content": new_post.content,
        "author_id": new_post.author_id,
        "author_name": new_post.author_name,
        "views": new_post.views,
        "likes": new_post.likes,
        "created_at": new_post.created_at.isoformat() if new_post.created_at else None,
        "comments_count": 0
    }


# 5-4. 게시글 수정 (Update) - 로그인 필수 & 본인 작성글만 가능
@app.put("/posts/{post_id}")
def update_post(
    post_id: int,
    form: PostUpdate,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")

    # 작성자 검증
    if str(post.author_id) != str(user.id):
        raise HTTPException(status_code=403, detail="본인이 작성한 글만 수정할 수 있습니다.")

    if form.category is not None:
        post.category = form.category
    if form.title is not None:
        post.title = form.title
    if form.content is not None:
        post.content = form.content

    post.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(post)

    return {"message": "게시글이 성공적으로 수정되었습니다.", "id": post.id}


# 5-5. 게시글 삭제 (Delete) - 로그인 필수 & 본인 작성글만 가능
@app.delete("/posts/{post_id}")
def delete_post(
    post_id: int,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")

    if str(post.author_id) != str(user.id):
        raise HTTPException(status_code=403, detail="본인이 작성한 글만 삭제할 수 있습니다.")

    db.delete(post)
    db.commit()
    return {"message": "게시글이 삭제되었습니다."}


# 5-6. 게시글 추천 (Like)
@app.post("/posts/{post_id}/like")
def like_post(post_id: int, db: Session = Depends(get_db)):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")

    post.likes += 1
    db.commit()
    return {"likes": post.likes}


# 5-7. 댓글 작성 (Create Comment) - 로그인 필수
@app.post("/posts/{post_id}/comments")
def create_comment(
    post_id: int,
    form: CommentCreate,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")

    comment = Comment(
        post_id=post_id,
        author_id=str(user.id),
        author_name=user.username,
        content=form.content
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    return {
        "id": comment.id,
        "author_id": comment.author_id,
        "author_name": comment.author_name,
        "content": comment.content,
        "created_at": comment.created_at.isoformat() if comment.created_at else None
    }


# 5-8. 댓글 삭제 (Delete Comment) - 로그인 필수 & 본인 댓글만 가능
@app.delete("/comments/{comment_id}")
def delete_comment(
    comment_id: int,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    comment = db.get(Comment, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")

    if str(comment.author_id) != str(user.id):
        raise HTTPException(status_code=403, detail="본인이 작성한 댓글만 삭제할 수 있습니다.")

    db.delete(comment)
    db.commit()
    return {"message": "댓글이 삭제되었습니다."}