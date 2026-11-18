# FastAPI Login Backend

FastAPI 기반의 사용자 인증 및 프로필 관리 백엔드 API입니다.

## 주요 기능
- 회원가입 (`POST /signup`)
- 로그인 및 토큰 발급 (`POST /login`)
- 내 정보 조회 (`GET /me`)
- 회원 목록 조회 (`GET /profiles`)
- 카카오 소셜 로그인 (`GET /login/kakao`)

## 실행 방법
```bash
uv run uvicorn main:app --reload
```
