import { useState, useEffect } from 'react'
import './App.css'

const API_BASE = '/api' // vite.config.js proxy routes /api -> http://127.0.0.1:8000

const CATEGORIES = ['전체', 'HOT', '잡담', '후기', '정보', '유머', '질문']

function App() {
  // Navigation & View State: 'board' | 'detail' | 'write' | 'edit' | 'auth'
  const [view, setView] = useState('board')
  const [authTab, setAuthTab] = useState('login') // 'login', 'signup', 'profile', 'profiles'
  
  // Board State
  const [posts, setPosts] = useState([])
  const [totalPosts, setTotalPosts] = useState(0)
  const [selectedCategory, setSelectedCategory] = useState('전체')
  const [keyword, setKeyword] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const limit = 12

  // Post Detail & CRUD State
  const [currentPost, setCurrentPost] = useState(null)
  const [writeForm, setWriteForm] = useState({ category: '잡담', title: '', content: '', author_name: '' })
  const [editForm, setEditForm] = useState({ id: null, category: '잡담', title: '', content: '' })
  const [commentInput, setCommentInput] = useState('')

  // Auth State
  const [token, setToken] = useState(() => localStorage.getItem('access_token') || '')
  const [currentUser, setCurrentUser] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [signupForm, setSignupForm] = useState({ username: '', email: '', password: '' })

  // UI Status
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState({ type: '', message: '' })

  // 1. 소셜 로그인 리다이렉트 토큰 확인
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tokenFromUrl = params.get('access_token')
    if (tokenFromUrl) {
      setToken(tokenFromUrl)
      localStorage.setItem('access_token', tokenFromUrl)
      window.history.replaceState({}, document.title, window.location.pathname)
      setFeedback({ type: 'success', message: '소셜 로그인에 성공했습니다! 게시판으로 이동합니다.' })
      setView('board') // 로그인 완료 후 바로 게시판 목록으로 이동
    }
  }, [])

  // 2. 토큰 변경 시 내 정보 조회
  useEffect(() => {
    if (token) {
      fetchMyProfile(token)
    } else {
      setCurrentUser(null)
    }
  }, [token])

  // 3. 게시글 목록 불러오기
  const fetchPosts = async () => {
    setLoading(true)
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      })
      if (selectedCategory && selectedCategory !== '전체') {
        queryParams.append('category', selectedCategory)
      }
      if (keyword.trim()) {
        queryParams.append('keyword', keyword.trim())
      }

      const res = await fetch(`${API_BASE}/posts?${queryParams.toString()}`)
      if (!res.ok) throw new Error('게시글 목록을 불러오지 못했습니다.')
      const data = await res.json()
      setPosts(data.posts)
      setTotalPosts(data.total)
    } catch (err) {
      setFeedback({ type: 'error', message: err.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (view === 'board') {
      fetchPosts()
    }
  }, [selectedCategory, keyword, page, view])

  // 4. 게시글 상세 조회
  const fetchPostDetail = async (postId) => {
    setLoading(true)
    setFeedback({ type: '', message: '' })
    try {
      const res = await fetch(`${API_BASE}/posts/${postId}`)
      if (!res.ok) throw new Error('게시글을 불러올 수 없습니다.')
      const data = await res.json()
      setCurrentPost(data)
      setView('detail')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setFeedback({ type: 'error', message: err.message })
    } finally {
      setLoading(false)
    }
  }

  // 5. 게시글 작성 (C - 로그인 필수)
  const handleCreatePost = async (e) => {
    e.preventDefault()
    if (!currentUser || !token) {
      alert('게시글 작성은 로그인이 필요한 서비스입니다.')
      setView('auth')
      setAuthTab('login')
      return
    }

    if (!writeForm.title.trim() || !writeForm.content.trim()) {
      alert('제목과 내용을 입력해주세요.')
      return
    }

    setLoading(true)
    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      }

      const payload = {
        category: writeForm.category,
        title: writeForm.title,
        content: writeForm.content,
      }

      const res = await fetch(`${API_BASE}/posts`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.detail || '게시글 등록에 실패했습니다.')
      }
      const newPost = await res.json()

      setFeedback({ type: 'success', message: '게시글이 성공적으로 등록되었습니다!' })
      setWriteForm({ category: '잡담', title: '', content: '', author_name: '' })
      fetchPostDetail(newPost.id)
    } catch (err) {
      setFeedback({ type: 'error', message: err.message })
    } finally {
      setLoading(false)
    }
  }

  // 6. 게시글 수정 (U - 본인만 가능)
  const handleUpdatePost = async (e) => {
    e.preventDefault()
    if (!currentUser || !token) {
      alert('로그인이 필요한 서비스입니다.')
      setView('auth')
      setAuthTab('login')
      return
    }

    if (!editForm.title.trim() || !editForm.content.trim()) {
      alert('제목과 내용을 입력해주세요.')
      return
    }

    setLoading(true)
    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      }

      const res = await fetch(`${API_BASE}/posts/${editForm.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          category: editForm.category,
          title: editForm.title,
          content: editForm.content,
        }),
      })
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.detail || '게시글 수정에 실패했습니다.')
      }

      setFeedback({ type: 'success', message: '게시글이 수정되었습니다!' })
      fetchPostDetail(editForm.id)
    } catch (err) {
      setFeedback({ type: 'error', message: err.message })
    } finally {
      setLoading(false)
    }
  }

  // 7. 게시글 삭제 (D - 본인만 가능)
  const handleDeletePost = async (postId) => {
    if (!currentUser || !token) {
      alert('로그인이 필요한 서비스입니다.')
      setView('auth')
      setAuthTab('login')
      return
    }

    if (!window.confirm('정말 이 게시글을 삭제하시겠습니까?')) return

    setLoading(true)
    try {
      const headers = {
        Authorization: `Bearer ${token}`,
      }

      const res = await fetch(`${API_BASE}/posts/${postId}`, {
        method: 'DELETE',
        headers,
      })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.detail || '본인이 작성한 글만 삭제할 수 있습니다.')
      }

      setFeedback({ type: 'success', message: '게시글이 삭제되었습니다.' })
      setView('board')
      fetchPosts()
    } catch (err) {
      setFeedback({ type: 'error', message: err.message })
    } finally {
      setLoading(false)
    }
  }

  // 8. 게시글 추천
  const handleLikePost = async (postId) => {
    try {
      const res = await fetch(`${API_BASE}/posts/${postId}/like`, { method: 'POST' })
      if (!res.ok) throw new Error('추천 처리에 실패했습니다.')
      const data = await res.json()
      setCurrentPost((prev) => prev ? { ...prev, likes: data.likes } : null)
    } catch (err) {
      alert(err.message)
    }
  }

  // 9. 댓글 작성 (C - 로그인 필수)
  const handleAddComment = async (e) => {
    e.preventDefault()
    if (!currentUser || !token) {
      if (window.confirm('댓글 작성은 로그인이 필요한 서비스입니다.\n로그인 페이지로 이동하시겠습니까?')) {
        setView('auth')
        setAuthTab('login')
      }
      return
    }

    if (!commentInput.trim()) return

    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      }

      const res = await fetch(`${API_BASE}/posts/${currentPost.id}/comments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content: commentInput.trim(),
        }),
      })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.detail || '댓글 등록 실패')
      }
      const newComment = await res.json()

      setCurrentPost((prev) => ({
        ...prev,
        comments: [...prev.comments, newComment],
      }))
      setCommentInput('')
    } catch (err) {
      alert(err.message)
    }
  }

  // 10. 댓글 삭제 (D - 본인만 가능)
  const handleDeleteComment = async (commentId) => {
    if (!currentUser || !token) {
      alert('로그인이 필요한 서비스입니다.')
      return
    }

    if (!window.confirm('댓글을 삭제하시겠습니까?')) return

    try {
      const headers = {
        Authorization: `Bearer ${token}`,
      }

      const res = await fetch(`${API_BASE}/comments/${commentId}`, {
        method: 'DELETE',
        headers,
      })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.detail || '본인이 작성한 댓글만 삭제할 수 있습니다.')
      }

      setCurrentPost((prev) => ({
        ...prev,
        comments: prev.comments.filter((c) => c.id !== commentId),
      }))
    } catch (err) {
      alert(err.message)
    }
  }

  // 11. Auth 관련 기능
  const fetchMyProfile = async (authToken = token) => {
    try {
      const res = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        setCurrentUser(data)
      } else {
        handleLogout()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setFeedback({ type: '', message: '' })
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || '로그인 실패')

      setToken(data.access_token)
      localStorage.setItem('access_token', data.access_token)
      setFeedback({ type: 'success', message: '로그인에 성공했습니다!' })
      setView('board')
    } catch (err) {
      setFeedback({ type: 'error', message: err.message })
    } finally {
      setLoading(false)
    }
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    setLoading(true)
    setFeedback({ type: '', message: '' })
    try {
      const res = await fetch(`${API_BASE}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signupForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || '회원가입 실패')

      setFeedback({ type: 'success', message: `회원가입 완료 (${data.username})! 이제 로그인해주세요.` })
      setLoginForm((prev) => ({ ...prev, email: signupForm.email }))
      setAuthTab('login')
    } catch (err) {
      setFeedback({ type: 'error', message: err.message })
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    setToken('')
    setCurrentUser(null)
    localStorage.removeItem('access_token')
    setFeedback({ type: 'success', message: '로그아웃 되었습니다.' })
  }

  const handleGoogleLogin = () => {
    window.location.href = 'http://127.0.0.1:8000/login/google'
  }

  const handleKakaoLogin = () => {
    window.location.href = 'http://127.0.0.1:8000/login/kakao'
  }

  // 날짜/시간 포맷팅 (오늘이면 시간, 이전이면 날짜)
  const formatDateTime = (isoString) => {
    if (!isoString) return ''
    const d = new Date(isoString)
    const now = new Date()
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()

    if (isToday) {
      const h = String(d.getHours()).padStart(2, '0')
      const m = String(d.getMinutes()).padStart(2, '0')
      return `${h}:${m}`
    } else {
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${m}.${day}`
    }
  }

  // 페이지네이션 계산
  const totalPages = Math.ceil(totalPosts / limit) || 1

  return (
    <div className="theqoo-wrapper">
      {/* 1. theqoo.net 스타일 상단 네이비 헤더 */}
      <header className="theqoo-header">
        <div className="header-container">
          <div className="logo-area" onClick={() => { setView('board'); setSelectedCategory('전체'); setKeyword(''); setPage(1) }}>
            <span className="logo-sub">인터넷 덕후들의 커뮤니티</span>
            <div className="logo-main">
              <span className="logo-text">theqoo</span>
              <span className="logo-dot">.net</span>
              <span className="logo-tag">스퀘어</span>
            </div>
          </div>

          <div className="user-nav">
            {currentUser ? (
              <div className="user-profile-badge">
                <span className="user-name">
                  <strong>{currentUser.username}</strong> 님
                </span>
                <span className={`provider-tag ${currentUser.provider}`}>
                  {currentUser.provider}
                </span>
                <button className="btn-header-link" onClick={() => { setView('auth'); setAuthTab('profile') }}>
                  내정보
                </button>
                <button className="btn-header-link" onClick={handleLogout}>
                  로그아웃
                </button>
              </div>
            ) : (
              <div className="guest-nav">
                <button className="btn-header-primary" onClick={() => { setView('auth'); setAuthTab('login') }}>
                  로그인 / 가입
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 2. 더쿠 카테고리 탭 바 */}
      <nav className="category-navbar">
        <div className="category-container">
          <ul className="category-list">
            {CATEGORIES.map((cat) => (
              <li
                key={cat}
                className={`category-item ${selectedCategory === cat && view === 'board' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedCategory(cat)
                  setKeyword('')
                  setPage(1)
                  setView('board')
                }}
              >
                {cat === 'HOT' ? '🔥 핫게' : cat}
              </li>
            ))}
          </ul>

          <div className="header-actions">
            <button
              className="btn-theqoo-write"
              onClick={() => {
                if (!currentUser) {
                  if (window.confirm('게시글 작성은 로그인이 필요한 서비스입니다.\n로그인 페이지로 이동하시겠습니까?')) {
                    setView('auth')
                    setAuthTab('login')
                  }
                  return
                }
                setWriteForm({
                  category: selectedCategory === 'HOT' || selectedCategory === '전체' ? '잡담' : selectedCategory,
                  title: '',
                  content: '',
                  author_name: currentUser.username,
                })
                setView('write')
              }}
            >
              ✏️ 글쓰기
            </button>
          </div>
        </div>
      </nav>

      {/* 3. 시스템 알림 메시지 */}
      {feedback.message && (
        <div className="alert-wrapper">
          <div className={`theqoo-alert ${feedback.type}`}>
            {feedback.message}
            <button className="btn-close-alert" onClick={() => setFeedback({ type: '', message: '' })}>✕</button>
          </div>
        </div>
      )}

      {/* 4. 메인 콘텐츠 영역 */}
      <main className="theqoo-main">
        {/* VIEW 1: 게시글 목록 (theqoo 전통 테이블 뷰) */}
        {view === 'board' && (
          <div className="board-container">
            <div className="board-sub-header">
              <span className="category-indicator">
                <strong>{selectedCategory === 'HOT' ? '🔥 실시간 핫게' : selectedCategory}</strong> 목록 (총 {totalPosts}개)
              </span>
              {keyword && (
                <span className="search-filter-tag">
                  검색어: "{keyword}" <button onClick={() => setKeyword('')}>✕</button>
                </span>
              )}
            </div>

            {loading && posts.length === 0 ? (
              <div className="theqoo-loading">데이터를 불러오는 중입니다...</div>
            ) : (
              <table className="theqoo-table">
                <thead>
                  <tr>
                    <th className="col-no">번호</th>
                    <th className="col-cat">분류</th>
                    <th className="col-title">제목</th>
                    <th className="col-author">글쓴이</th>
                    <th className="col-date">등록일</th>
                    <th className="col-views">조회</th>
                    <th className="col-likes">추천</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="empty-row">
                        등록된 게시글이 없습니다. 첫 글을 작성해보세요!
                      </td>
                    </tr>
                  ) : (
                    posts.map((p) => {
                      const isHot = p.likes >= 10 || p.views >= 100
                      return (
                        <tr key={p.id} className={isHot ? 'hot-row' : ''} onClick={() => fetchPostDetail(p.id)}>
                          <td className="col-no">{p.id}</td>
                          <td className="col-cat">
                            <span className={`badge-cat cat-${p.category}`}>
                              {p.category}
                            </span>
                          </td>
                          <td className="col-title">
                            <span className="post-title-text">{p.title}</span>
                            {p.comments_count > 0 && (
                              <span className="comment-count-badge">
                                [{p.comments_count}]
                              </span>
                            )}
                            {isHot && <span className="hot-flame">🔥</span>}
                          </td>
                          <td className="col-author">{p.author_name}</td>
                          <td className="col-date">{formatDateTime(p.created_at)}</td>
                          <td className="col-views">{p.views}</td>
                          <td className="col-likes">{p.likes > 0 ? p.likes : '-'}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            )}

            {/* 하단 페이지네이션 및 검색 바 */}
            <div className="board-footer">
              <div className="pagination">
                <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  이전
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
                  <button
                    key={num}
                    className={page === num ? 'active-page' : ''}
                    onClick={() => setPage(num)}
                  >
                    {num}
                  </button>
                ))}
                <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  다음
                </button>
              </div>

              <div className="board-search">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    setKeyword(searchInput)
                    setPage(1)
                  }}
                >
                  <input
                    type="text"
                    placeholder="제목, 내용, 작성자 검색"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                  <button type="submit">검색</button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: 게시글 상세 보기 (Detail View + theqoo Comments) */}
        {view === 'detail' && currentPost && (
          <div className="post-detail-container">
            <div className="post-header-bar">
              <span className={`badge-cat cat-${currentPost.category}`}>
                {currentPost.category}
              </span>
              <h1 className="post-detail-title">{currentPost.title}</h1>
              <div className="post-meta-row">
                <span className="author-badge"><strong>{currentPost.author_name}</strong></span>
                <span className="divider-dot">·</span>
                <span>{new Date(currentPost.created_at).toLocaleString('ko-KR')}</span>
                <span className="divider-dot">·</span>
                <span>조회 <strong>{currentPost.views}</strong></span>
                <span className="divider-dot">·</span>
                <span>추천 <strong>{currentPost.likes}</strong></span>
              </div>
            </div>

            <div className="post-body-content">
              {currentPost.content.split('\n').map((line, idx) => (
                <p key={idx}>{line}</p>
              ))}
            </div>

            {/* 추천 및 수정/삭제 액션 바 */}
            <div className="post-action-bar">
              <div className="like-btn-wrap">
                <button className="btn-theqoo-like" onClick={() => handleLikePost(currentPost.id)}>
                  👍 추천 <strong>{currentPost.likes}</strong>
                </button>
              </div>

              <div className="right-actions">
                {currentUser && currentPost.author_id === currentUser.id && (
                  <>
                    <button
                      className="btn-post-action"
                      onClick={() => {
                        setEditForm({
                          id: currentPost.id,
                          category: currentPost.category,
                          title: currentPost.title,
                          content: currentPost.content,
                        })
                        setView('edit')
                      }}
                    >
                      수정
                    </button>
                    <button
                      className="btn-post-action delete"
                      onClick={() => handleDeletePost(currentPost.id)}
                    >
                      삭제
                    </button>
                  </>
                )}
                <button className="btn-post-action list" onClick={() => setView('board')}>
                  목록으로
                </button>
              </div>
            </div>

            {/* theqoo 시그니처 댓글 섹션 */}
            <div className="theqoo-comments-section">
              <div className="comments-header">
                <h3>댓글 <span>{currentPost.comments.length}</span>개</h3>
              </div>

              <div className="comments-list">
                {currentPost.comments.length === 0 ? (
                  <div className="no-comments">가장 먼저 댓글을 남겨보세요!</div>
                ) : (
                  currentPost.comments.map((comment, index) => (
                    <div key={comment.id} className="comment-item">
                      <div className="comment-meta">
                        <span className="comment-order">{index + 1}덬.</span>
                        <span className="comment-author">{comment.author_name}</span>
                        <span className="comment-date">{formatDateTime(comment.created_at)}</span>
                        {currentUser && comment.author_id === currentUser.id && (
                          <button
                            className="btn-comment-delete"
                            onClick={() => handleDeleteComment(comment.id)}
                            title="댓글 삭제"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <div className="comment-text">{comment.content}</div>
                    </div>
                  ))
                )}
              </div>

              {/* 댓글 작성 폼 - 로그인 연동 */}
              {currentUser ? (
                <form className="comment-write-form" onSubmit={handleAddComment}>
                  <div className="comment-writer-indicator">
                    작성자: <strong>{currentUser.username}</strong> 님
                  </div>
                  <div className="comment-input-row">
                    <textarea
                      rows={2}
                      placeholder="타인을 배려하는 예쁜 말을 남겨주세요."
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                    />
                    <button type="submit" className="btn-comment-submit">등록</button>
                  </div>
                </form>
              ) : (
                <div className="comment-login-required">
                  <span>💬 댓글을 작성하려면 로그인이 필요합니다.</span>
                  <button
                    type="button"
                    className="btn-comment-login"
                    onClick={() => { setView('auth'); setAuthTab('login') }}
                  >
                    로그인하기
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 3: 게시글 작성 (Write Form - 로그인 필수) */}
        {view === 'write' && (
          <div className="post-form-container">
            {!currentUser ? (
              <div className="login-required-card">
                <h3>🔒 로그인이 필요한 서비스입니다</h3>
                <p>더쿠 커뮤니티에 게시글을 작성하려면 먼저 로그인해주세요.</p>
                <button
                  className="btn-primary"
                  onClick={() => { setView('auth'); setAuthTab('login') }}
                >
                  로그인하러 가기
                </button>
              </div>
            ) : (
              <>
                <h2>게시글 작성</h2>
                <form onSubmit={handleCreatePost}>
                  <div className="form-group-row">
                    <label>분류 (말머리)</label>
                    <select
                      value={writeForm.category}
                      onChange={(e) => setWriteForm({ ...writeForm, category: e.target.value })}
                    >
                      <option value="잡담">잡담</option>
                      <option value="후기">후기</option>
                      <option value="정보">정보</option>
                      <option value="유머">유머</option>
                      <option value="질문">질문</option>
                      <option value="HOT">HOT</option>
                    </select>
                  </div>

                  <div className="form-group-row">
                    <label>작성자</label>
                    <span className="author-locked-badge">
                      <strong>{currentUser.username}</strong> 님
                    </span>
                  </div>

                  <div className="form-group">
                    <label>제목</label>
                    <input
                      type="text"
                      placeholder="제목을 입력하세요"
                      required
                      value={writeForm.title}
                      onChange={(e) => setWriteForm({ ...writeForm, title: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>내용</label>
                    <textarea
                      rows={12}
                      placeholder="내용을 작성해주세요."
                      required
                      value={writeForm.content}
                      onChange={(e) => setWriteForm({ ...writeForm, content: e.target.value })}
                    />
                  </div>

                  <div className="form-btn-group">
                    <button type="button" className="btn-secondary" onClick={() => setView('board')}>
                      취소
                    </button>
                    <button type="submit" className="btn-primary" disabled={loading}>
                      {loading ? '등록 중...' : '게시글 등록'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        )}

        {/* VIEW 4: 게시글 수정 (Edit Form) */}
        {view === 'edit' && (
          <div className="post-form-container">
            <h2>게시글 수정</h2>
            <form onSubmit={handleUpdatePost}>
              <div className="form-group-row">
                <label>분류</label>
                <select
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                >
                  <option value="잡담">잡담</option>
                  <option value="후기">후기</option>
                  <option value="정보">정보</option>
                  <option value="유머">유머</option>
                  <option value="질문">질문</option>
                  <option value="HOT">HOT</option>
                </select>
              </div>

              <div className="form-group">
                <label>제목</label>
                <input
                  type="text"
                  required
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>내용</label>
                <textarea
                  rows={12}
                  required
                  value={editForm.content}
                  onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                />
              </div>

              <div className="form-btn-group">
                <button type="button" className="btn-secondary" onClick={() => setView('detail')}>
                  취소
                </button>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? '수정 중...' : '수정 완료'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* VIEW 5: 로그인 / 회원가입 / 내정보 / 관리 (Auth Area) */}
        {view === 'auth' && (
          <div className="auth-container">
            <div className="auth-header">
              <h2>계정 및 프로필 관리</h2>
              <button className="btn-back-board" onClick={() => setView('board')}>
                ← 게시판으로 돌아가기
              </button>
            </div>

            <div className="auth-tab-nav">
              <button className={`auth-tab-btn ${authTab === 'login' ? 'active' : ''}`} onClick={() => setAuthTab('login')}>
                로그인
              </button>
              <button className={`auth-tab-btn ${authTab === 'signup' ? 'active' : ''}`} onClick={() => setAuthTab('signup')}>
                회원가입
              </button>
              {token && (
                <button className={`auth-tab-btn ${authTab === 'profile' ? 'active' : ''}`} onClick={() => setAuthTab('profile')}>
                  내 프로필
                </button>
              )}
            </div>

            <div className="auth-card">
              {authTab === 'login' && (
                <div className="form-section">
                  {currentUser ? (
                    <div className="already-logged-in-card">
                      <p className="logged-in-msg">
                        이미 <strong>{currentUser.username}</strong> 계정으로 로그인되어 있습니다.
                      </p>
                      <button className="btn-primary" onClick={() => setView('board')}>
                        게시판으로 바로가기
                      </button>
                    </div>
                  ) : (
                    <>
                      <h3>이메일 로그인</h3>
                      <form onSubmit={handleLogin}>
                        <div className="input-group">
                          <label>이메일</label>
                          <input
                            type="email"
                            required
                            placeholder="user@example.com"
                            value={loginForm.email}
                            onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                          />
                        </div>
                        <div className="input-group">
                          <label>비밀번호</label>
                          <input
                            type="password"
                            required
                            placeholder="비밀번호"
                            value={loginForm.password}
                            onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                          />
                        </div>
                        <button type="submit" className="btn-primary" disabled={loading}>
                          {loading ? '로그인 중...' : '로그인'}
                        </button>
                      </form>

                      <div className="divider"><span>또는 소셜 계정으로 로그인</span></div>

                      <div className="social-buttons">
                        <button type="button" className="btn-google" onClick={handleGoogleLogin}>
                          <svg className="google-icon" viewBox="0 0 24 24" width="18" height="18">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                          </svg>
                          Google 계정으로 로그인
                        </button>
                        <button type="button" className="btn-kakao" onClick={handleKakaoLogin}>
                          <span className="kakao-symbol">●</span> 카카오 계정으로 로그인
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {authTab === 'signup' && (
                <div className="form-section">
                  <h3>신규 회원가입</h3>
                  <form onSubmit={handleSignup}>
                    <div className="input-group">
                      <label>사용자명 (Username)</label>
                      <input
                        type="text"
                        required
                        placeholder="게시판에 표시될 닉네임"
                        value={signupForm.username}
                        onChange={(e) => setSignupForm({ ...signupForm, username: e.target.value })}
                      />
                    </div>
                    <div className="input-group">
                      <label>이메일</label>
                      <input
                        type="email"
                        required
                        placeholder="user@example.com"
                        value={signupForm.email}
                        onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
                      />
                    </div>
                    <div className="input-group">
                      <label>비밀번호</label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        placeholder="6자리 이상 비밀번호"
                        value={signupForm.password}
                        onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
                      />
                    </div>
                    <button type="submit" className="btn-primary" disabled={loading}>
                      {loading ? '가입 중...' : '가입하기'}
                    </button>
                  </form>
                </div>
              )}

              {authTab === 'profile' && currentUser && (
                <div className="profile-section">
                  <h3>내 프로필</h3>
                  <div className="profile-row"><span className="label">닉네임:</span> <strong>{currentUser.username}</strong></div>
                  <div className="profile-row"><span className="label">이메일:</span> <span>{currentUser.email}</span></div>
                  <div className="profile-row"><span className="label">가입 제공자:</span> <span className="badge">{currentUser.provider}</span></div>
                  <div className="action-buttons">
                    <button className="btn-danger" onClick={() => { handleLogout(); setAuthTab('login') }}>로그아웃</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* 5. theqoo 스타일 푸터 */}
      <footer className="theqoo-footer">
        <p>Copyright © <strong>theqoo.net</strong> clone. Built with FastAPI & React Vite (Supabase Auth)</p>
      </footer>
    </div>
  )
}

export default App
