# FastAPI Login & React(Vite) Full-Stack Project

FastAPI 백엔드와 React(Vite) 프론트엔드로 구성된 회원가입 / 로그인 / 프로필 관리 프로젝트입니다.

---

## 📁 디렉터리 구조

```text
19_fastapi-login/
├── backend/                  # FastAPI 백엔드
│   ├── src/                  # 패키지 소스
│   ├── main.py               # FastAPI 메인 애플리케이션
│   ├── main test.py          # 테스트 및 추가 구현 코드
│   ├── pyproject.toml        # uv 의존성 및 패키지 설정
│   ├── uv.lock               # 의존성 락 파일
│   ├── .python-version       # Python 버전 지정
│   └── README.md
│
├── frontend/                 # React (Vite) 프론트엔드
│   ├── src/
│   │   ├── App.jsx           # 로그인/회원가입/프로필 UI
│   │   ├── App.css           # UI 스타일시트
│   │   └── main.jsx
│   ├── package.json          # Node 의존성 설정
│   ├── vite.config.js        # Vite 설정 (Backend 프록시 설정 포함)
│   └── index.html
│
└── README.md                 # 프로젝트 전체 가이드
```

---

## 🚀 실행 방법

### 1. 백엔드 (FastAPI) 실행
새 터미널을 열고 `backend` 폴더로 이동하여 uvicorn을 실행합니다:

```bash
cd backend
uv run uvicorn main:app --reload
```

- 서버 주소: `http://127.0.0.1:8000`
- Swagger API 문서: `http://127.0.0.1:8000/docs`

---

### 2. 프론트엔드 (React + Vite) 실행
별도의 터미널을 열고 `frontend` 폴더로 이동하여 개발 서버를 실행합니다:

```bash
cd frontend
npm run dev
```

- 웹 앱 주소: `http://localhost:5173`

---

## 🔑 주요 API 및 기능

### 1. 회원 인증 (Supabase Auth)
- **회원가입**: `POST /signup` (Username, Email, Password)
- **로그인**: `POST /login` (Email, Password -> JWT Access Token 반환)
- **내 정보 조회**: `GET /me` (Bearer 토큰 필요)
- **회원 목록**: `GET /profiles`
- **카카오 소셜 로그인**: `GET /login/kakao`
- **구글 소셜 로그인**: `GET /login/google`
- **OAuth 콜백**: `GET /auth/callback`

### 2. 더쿠(theqoo.net) 스타일 커뮤니티 게시판 (CRUD)
- **게시글 목록 조회 (R)**: `GET /posts` (카테고리 필터링, 검색, 페이징, 핫게 정렬)
- **게시글 상세 조회 (R)**: `GET /posts/{post_id}` (조회수 자동 증가, 댓글 목록 포함)
- **게시글 작성 (C)**: `POST /posts` (말머리, 제목, 내용, 작성자)
- **게시글 수정 (U)**: `PUT /posts/{post_id}` (작성자 확인)
- **게시글 삭제 (D)**: `DELETE /posts/{post_id}` (작성자 확인)
- **게시글 추천**: `POST /posts/{post_id}/like`
- **댓글 작성 (C)**: `POST /posts/{post_id}/comments` (N덬 / 무명의 더쿠 시스템)
- **댓글 삭제 (D)**: `DELETE /comments/{comment_id}`
