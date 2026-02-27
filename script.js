// [DEPLOYMENT] Cloudflare Pages Sync - 2026-01-03 10:55
// ==========================================
// 1. IMPORTS & GLOBALS (ES Module)
// ==========================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
// Localization merged directly into script to bypass MIME type issues

// Global State
var posts = [];
var users = [];
var defaultCats = [
    { id: 'board', i18n: 'cat-research' },
    { id: 'drawing', i18n: 'cat-drawings' },
    { id: 'bug_report', i18n: 'cat-bug' }
];
var socialLinks = [];
var categories = [];
var currentUser = null;
var currentCategory = 'all';
var isAdminMode = false;
var bgmAudio = null;
var isPlaying = false;
var selectedPostIds = new Set();
var SESSION_KEY = 'nano_dorothy_session';
var currentPage = 1;
var postsPerPage = 12;

// [NEW] Version Control
const APP_VERSION = '2026.02.27.1430';
var isServerDown = false;

// ==========================================
// 1.5 LOCALIZATION (INLINED)
// ==========================================
const translations = {
    ko: {
        "nav-records": "기록소", "nav-chat": "💬 채팅하기", "nav-journal": "일지", "nav-login": "로그인", "nav-signup": "회원가입", "nav-logout": "로그아웃", "nav-account": "계정 관리",
        "msg-dear": "님",
        "header-subtitle": "기록이 흐르고, 대화가 머무는 곳", "welcome-back": "다시 오신 것을 환영합니다, ", "welcome-subtitle": "당신의 자원을 탐색하세요.",
        "sidebar-cats": "주요 카테고리", "sidebar-admin": "관리자 패널", "sidebar-connect": "연결", "sidebar-bgm": "BGM 플레이어",
        "best-posts": "베스트 포스트", "feeds": "피드", "write": "글쓰기", "back-to-list": "← 목록으로", "comments": "댓글", "comment-placeholder": "댓글을 입력하세요...", "comment-submit": "등록", "comment-login-required": "댓글을 달려면 로그인이 필요합니다.",
        "settings-title": "⚙️ 환경 설정", "settings-notif-sound": "🔔 알림 소리", "settings-notif-desc": "새 메시지 도착 시 소리로 알립니다.", "settings-layout": "레이아웃 조절", "settings-layout-desc": "화면 너비와 높이를 조절합니다.", "settings-font": "글자 크기", "settings-lang": "🌐 언어 설정 (Language)", "settings-lang-desc": "시스템 언어를 변경합니다.", "confirm": "확인", "cancel": "취소",
        "auth-login": "로그인", "auth-signup": "회원가입", "auth-id": "아이디", "auth-pw": "비밀번호", "auth-nickname": "닉네임", "auth-enter": "입장", "auth-no-acc": "계정이 없으신가요?", "auth-yes-acc": "이미 계정이 있으신가요?", "auth-select-country": "국가 선택", "auth-select-lang": "언어 선택", "auth-location-consent": "위치 정보 수집 및 이용에 동의합니다 (선택)",
        "chat-channels": "채널 목록", "chat-friends": "친구 목록", "chat-members": "멤버 목록", "chat-add-friend": "친구추가", "chat-create-channel": "내 채널 만들기", "chat-welcome-title": "ROSAE HUB에 오신 것을 환영합니다!", "chat-welcome-desc": "커뮤니티의 시작점입니다. 메시지를 남겨보세요.", "chat-input-placeholder": "메시지 보내기...", "chat-send": "전송", "chat-online": "온라인", "chat-back-to-blog": "↩️ 블로그로 돌아가기",
        "cat-notice": "📢 공지사항", "cat-chat": "💬 채팅방", "cat-karaoke": "🎤 노래방", "cat-voice": "📞 보이스 톡", "cat-game": "🎮 게임 방",
        "type-notice": " (공지)", "type-secret": " (비밀)", "type-open": " (오픈)", "type-qna": " (질문)",
        "time-now": "방금 전", "time-min": "분 전", "time-hour": "시간 전", "time-day": "일 전", "time-old": "오래 전", "time-offline": "오프라인",
        "btn-invite": "초대", "btn-delete": "삭제", "btn-edit": "수정", "btn-translate": "🌏 번역", "settings-auto-translate": "자동 번역", "settings-auto-translate-desc": "메시지를 자동으로 번역하여 표시합니다.",
        "cat-all": "전체보기 (ALL)", "cat-research": "연구소 소식", "cat-drawings": "갤러리", "cat-bug": "버그 신고", "status-posts": "개의 글", "status-no-posts": "아직 등록된 글이 없습니다.", "admin-user-mgr": "👥 사용자 관리", "admin-user-mgr-title": "전체 사용자 관리", "admin-user-mgr-desc": "가입된 전체 회원 목록입니다.", "btn-refresh": "목록 새로고침", "detail-archive": "아카이브", "detail-published": "발행", "detail-views": "조회", "cat-uncategorized": "미분류",
        "admin-cat-mgr": "카테고리 관리", "admin-social-links": "소셜 링크 설정", "admin-social-name": "이름 (예: INSTA)", "admin-social-url": "주소 (https://...)", "admin-social-add": "링크 추가", "admin-ai-logs": "ORACLE INSIGHTS (AI 로그)", "admin-chatbot-logs": "챗봇 로그 분석", "admin-test-server": "관리자 테스트 서버", "admin-maintenance": "서버 점검 관리", "chat-input-placeholder-dynamic": "에 메시지 보내기"
    },
    en: {
        "nav-records": "Records", "nav-chat": "💬 Chat", "nav-journal": "Journal", "nav-login": "Login", "nav-signup": "Sign Up", "nav-logout": "Logout", "nav-account": "Account",
        "msg-dear": "",
        "header-subtitle": "Where records flow and conversations stay", "welcome-back": "Welcome back, ", "welcome-subtitle": "Explore your resources.",
        "sidebar-cats": "MAIN CATEGORIES", "sidebar-admin": "ADMIN PANEL", "sidebar-connect": "CONNECT", "sidebar-bgm": "BGM PLAYER",
        "best-posts": "BEST POSTS", "feeds": "FEEDS", "write": "Write", "back-to-list": "← Back to List", "comments": "COMMENTS", "comment-placeholder": "Enter your comment...", "comment-submit": "Submit", "comment-login-required": "Login is required to comment.",
        "settings-title": "⚙️ Settings", "settings-notif-sound": "🔔 Notif Sound", "settings-notif-desc": "Play sound on new messages.", "settings-layout": "Layout Controls", "settings-layout-desc": "Adjust screen width and height.", "settings-font": "Font Size", "settings-lang": "🌐 Language Settings", "settings-lang-desc": "Change the system language.", "confirm": "Confirm", "cancel": "Cancel",
        "auth-login": "Login", "auth-signup": "Sign Up", "auth-id": "Username", "auth-pw": "Password", "auth-nickname": "Nickname", "auth-enter": "ENTER", "auth-no-acc": "Don't have an account?", "auth-yes-acc": "Already have an account?", "auth-select-country": "Select Country", "auth-select-lang": "Select Language", "auth-location-consent": "Agree to location collection (Optional)",
        "chat-channels": "Channels", "chat-friends": "Friends", "chat-members": "Members", "chat-add-friend": "Add Friend", "chat-create-channel": "Create Channel", "chat-welcome-title": "Welcome to ROSAE HUB!", "chat-welcome-desc": "This is the start of the community. Leave a message.", "chat-input-placeholder": "Send a message...", "chat-send": "Send", "chat-online": "Online", "chat-back-to-blog": "↩️ Back to Blog",
        "cat-notice": "📢 Notices", "cat-chat": "💬 Chat Rooms", "cat-karaoke": "🎤 Karaoke", "cat-voice": "📞 Voice Talk", "cat-game": "🎮 Gaming",
        "type-notice": " (Notice)", "type-secret": " (Secret)", "type-open": " (Open)", "type-qna": " (Q&A)",
        "time-now": "Just now", "time-min": "m ago", "time-hour": "h ago", "time-day": "d ago", "time-old": "Long ago", "time-offline": "Offline",
        "btn-invite": "Invite", "btn-delete": "Delete", "btn-edit": "Edit", "btn-translate": "🌏 Translate", "settings-auto-translate": "Auto-Translate", "settings-auto-translate-desc": "Automatically translate incoming messages.",
        "cat-all": "All (ALL)", "cat-research": "Research", "cat-drawings": "Drawings", "cat-bug": "Bug Report", "status-posts": "posts", "status-no-posts": "No posts found.", "admin-user-mgr": "👥 User Mgmt", "admin-user-mgr-title": "Global User Management", "admin-user-mgr-desc": "List of all registered members.", "btn-refresh": "Refresh List", "detail-archive": "Archive", "detail-published": "Published", "detail-views": "Views", "cat-uncategorized": "Uncategorized",
        "admin-cat-mgr": "Category Mgmt", "admin-social-links": "Social Links", "admin-social-name": "Name (e.g. INSTA)", "admin-social-url": "URL (https://...)", "admin-social-add": "Add Link", "admin-ai-logs": "ORACLE INSIGHTS (AI Logs)", "admin-chatbot-logs": "Chatbot Logs", "admin-test-server": "Admin Test Server", "admin-maintenance": "Server Maintenance", "chat-input-placeholder-dynamic": "Send a message to"
    },
    ja: {
        "nav-records": "記録所", "nav-chat": "💬 チャット", "nav-journal": "日誌", "nav-login": "ログイン", "nav-signup": "会員登録", "nav-logout": "ログアウト", "nav-account": "アカウント管理",
        "msg-dear": "様",
        "header-subtitle": "記録が流れ、会話が留まる場所", "welcome-back": "おかえりなさい、 ", "welcome-subtitle": "リソースを探索しましょう。",
        "sidebar-cats": "メインカテゴリー", "sidebar-admin": "管理者パネル", "sidebar-connect": "接続", "sidebar-bgm": "BGMプレイヤー",
        "best-posts": "ベストポスト", "feeds": "フィード", "write": "記事を書く", "back-to-list": "← リストに戻る", "comments": "コメント", "comment-placeholder": "コメントを入力してください...", "comment-submit": "登録", "comment-login-required": "コメントするにはログインが必要です。",
        "settings-title": "⚙️ 環境設定", "settings-notif-sound": "🔔 通知音", "settings-notif-desc": "新しいメッセージの到着を音で知らせます。", "settings-layout": "レイアウト調整", "settings-layout-desc": "画面の幅と高さを調整します。", "settings-font": "文字サイズ", "settings-lang": "🌐 言語設定", "settings-lang-desc": "システム言語を変更します。", "confirm": "確認", "cancel": "キャンセル",
        "auth-login": "ログイン", "auth-signup": "新規登録", "auth-id": "ID", "auth-pw": "パスワード", "auth-nickname": "ニックネーム", "auth-enter": "入場", "auth-no-acc": "アカウントをお持ちでないですか？", "auth-yes-acc": "すでにアカウントをお持ちですか？", "auth-select-country": "国を選択", "auth-select-lang": "言語を選択", "auth-location-consent": "位置情報の収集に同意する (任意)",
        "chat-channels": "チャンネル", "chat-friends": "友達", "chat-members": "メンバー", "chat-add-friend": "友達追加", "chat-create-channel": "チャンネル作成", "chat-welcome-title": "ROSAE HUBへようこそ！", "chat-welcome-desc": "コミュニティの始まりです。メッセージを残しましょう。", "chat-input-placeholder": "メッセージを送る...", "chat-send": "送信", "chat-online": "オンライン", "chat-back-to-blog": "↩️ ブログに戻る",
        "cat-notice": "📢 お知らせ", "cat-chat": "💬 チャットルーム", "cat-karaoke": "🎤 カラオケ", "cat-voice": "📞 ボイストーク", "cat-game": "🎮 ゲームルーム",
        "type-notice": " (お知らせ)", "type-secret": " (非公開)", "type-open": " (オープン)", "type-qna": " (Q&A)",
        "time-now": "たった今", "time-min": "分前", "time-hour": "時間前", "time-day": "日前", "time-old": "ずっと前", "time-offline": "オフライン",
        "btn-invite": "招待", "btn-delete": "削除", "btn-edit": "修正", "btn-translate": "🌏 翻訳", "settings-auto-translate": "自動翻訳", "settings-auto-translate-desc": "メッセージを自動的に翻訳して表示します。",
        "cat-all": "全表示 (ALL)", "cat-research": "研究所ニュース", "cat-drawings": "ギャラリー", "cat-bug": "バグ報告", "status-posts": "件の投稿", "status-no-posts": "まだ投稿がありません。", "admin-user-mgr": "👥 ユーザー管理", "admin-user-mgr-title": "全ユーザー管理", "admin-user-mgr-desc": "登録された全会員のリストです。", "btn-refresh": "リスト更新", "detail-archive": "アーカイブ", "detail-published": "発行", "detail-views": "閲覧", "cat-uncategorized": "未分類",
        "admin-cat-mgr": "カテゴリー管理", "admin-social-links": "SNSリンク設定", "admin-social-name": "名前 (例: INSTA)", "admin-social-url": "アドレス (https://...)", "admin-social-add": "링크 추가", "admin-ai-logs": "ORACLE INSIGHTS (AIログ)", "admin-chatbot-logs": "チャットボットログ分析", "admin-test-server": "管理者テストサーバー", "admin-maintenance": "サーバー点검 관리", "chat-input-placeholder-dynamic": "にメッセージを送信"
    },
    zh: {
        "nav-records": "记录所", "nav-chat": "💬 聊天", "nav-journal": "日记", "nav-login": "登录", "nav-signup": "注册", "nav-logout": "注销", "nav-account": "账号管理",
        "msg-dear": " ",
        "header-subtitle": "记录流动，对话停留的地方", "welcome-back": "欢迎回来, ", "welcome-subtitle": "探索您的资源。",
        "sidebar-cats": "主要类别", "sidebar-admin": "管理面板", "sidebar-connect": "连接", "sidebar-bgm": "BGM播放器",
        "best-posts": "推荐文章", "feeds": "动态", "write": "发帖", "back-to-list": "← 返回列表", "comments": "评论", "comment-placeholder": "输入评论...", "comment-submit": "提交", "comment-login-required": "登录后即可发表评论。",
        "settings-title": "⚙️ 设置", "settings-notif-sound": "🔔 提示音", "settings-notif-desc": "新消息到达时播放提示音。", "settings-layout": "布局调整", "settings-layout-desc": "调整屏幕宽度和高度。", "settings-font": "字体大小", "settings-lang": "🌐 语言设置", "settings-lang-desc": "更改系统 language。", "confirm": "确定", "cancel": "取消",
        "auth-login": "登录", "auth-signup": "注册", "auth-id": "用户名", "auth-pw": "密码", "auth-nickname": "昵称", "auth-enter": "进入", "auth-no-acc": "没有账号？", "auth-yes-acc": "已有账号？", "auth-select-country": "选择国家", "auth-select-lang": "选择语言", "auth-location-consent": "同意收集位置信息 (可选)",
        "chat-channels": "频道列表", "chat-friends": "好友列表", "chat-members": "成员列表", "chat-add-friend": "添加好友", "chat-create-channel": "创建频道", "chat-welcome-title": "欢迎来到 ROSAE HUB!", "chat-welcome-desc": "这是社区的起点。留下您的消息。", "chat-input-placeholder": "发送消息...", "chat-send": "发送", "chat-online": "在线", "chat-back-to-blog": "↩️ 返回博客",
        "cat-notice": "📢 公告事项", "cat-chat": "💬 聊天室", "cat-karaoke": "🎤 卡拉OK", "cat-voice": "📞 语音通话", "cat-game": "🎮 游戏室",
        "type-notice": " (公告)", "type-secret": " (私密)", "type-open": " (公开)", "type-qna": " (Q&A)",
        "time-now": "刚刚", "time-min": "分钟前", "time-hour": "小时前", "time-day": "天前", "time-old": "很久以前", "time-offline": "离线",
        "btn-invite": "邀请", "btn-delete": "删除", "btn-edit": "确认", "btn-translate": "🌏 翻译", "settings-auto-translate": "自动翻译", "settings-auto-translate-desc": "自动翻译并显示消息。",
        "cat-all": "全部显示 (ALL)", "cat-research": "研究所新闻", "cat-drawings": "画廊", "cat-bug": "Bug 报告", "status-posts": "条内容", "status-no-posts": "尚无内容。", "admin-user-mgr": "👥 用户管理", "admin-user-mgr-title": "全局用户管理", "admin-user-mgr-desc": "已注册会员列表。", "btn-refresh": "刷新列表", "detail-archive": "归档", "detail-published": "发布", "detail-views": "阅读", "cat-uncategorized": "未分类",
        "admin-cat-mgr": "类别管理", "admin-social-links": "社交链接设置", "admin-social-name": "名称 (如: INSTA)", "admin-social-url": "地址 (https://...)", "admin-social-add": "添加链接", "admin-ai-logs": "ORACLE INSIGHTS (AI日志)", "admin-chatbot-logs": "聊天机器人日志分析", "admin-test-server": "管理员测试服务器", "admin-maintenance": "服务器维护管理", "chat-input-placeholder-dynamic": "发送消息至"
    }
};

const LanguageManager = {
    currentLang: localStorage.getItem('app_lang') || 'ko',
    init() {
        this.applyTranslations();
        const select = document.getElementById('settings-lang-select');
        if (select) select.value = this.currentLang;
    },
    setLanguage(lang) {
        console.log('LanguageManager: Changing language to', lang);
        if (!translations[lang]) {
            console.error('LanguageManager: Translation not found for', lang);
            return;
        }
        this.currentLang = lang;
        localStorage.setItem('app_lang', lang);
        this.applyTranslations();
        // [MOD] Refresh entire UI including navigation
        if (typeof updateUserNav === 'function') updateUserNav();

        if (typeof renderCategories === 'function') renderCategories();
        if (typeof renderBestPosts === 'function') renderBestPosts();
        if (typeof renderPosts === 'function') renderPosts();
        // Sync with Supabase if logged in
        if (window.currentUser && window.supabase) {
            window.supabase.from('users').update({ language: lang }).eq('username', window.currentUser.username)
                .then(({ error }) => { if (error) console.error('Failed to sync language to DB:', error); });
        }
        // [NEW] Trigger re-render of dynamic content
        if (typeof renderAll === 'function') renderAll();
        else if (typeof renderPosts === 'function') renderPosts();
    },
    get(key) { return (translations[this.currentLang] && translations[this.currentLang][key]) || key; },
    applyTranslations() {
        const uiText = translations[this.currentLang];
        if (!uiText) return;
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const value = uiText[key];
            if (value) {
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.placeholder = value;
                else el.textContent = value;
            }
        });
        const welcomeName = document.getElementById('mobile-welcome-name');
        if (welcomeName && window.currentUser) {
            const welcomeTitle = document.querySelector('.welcome-title');
            if (welcomeTitle) {
                welcomeTitle.innerHTML = `${this.get('welcome-back')}<span id="mobile-welcome-name">${window.currentUser.nickname || window.currentUser.username}</span>! 👋`;
            }
        }
    }
};
window.LanguageManager = LanguageManager;
LanguageManager.init();

// [NEW] Auto-Translate Logic for Blog
function updateAutoTranslateUI() {
    const btn = document.getElementById('mobile-auto-translate-toggle');
    if (btn) {
        const enabled = localStorage.getItem('app_auto_translate') === 'true';
        btn.textContent = enabled ? 'ON' : 'OFF';
        btn.classList.toggle('on', enabled);
    }
}

function toggleAutoTranslate() {
    const current = localStorage.getItem('app_auto_translate') === 'true';
    const newState = !current;
    localStorage.setItem('app_auto_translate', newState);
    updateAutoTranslateUI();
    // Refresh posts to trigger translation if turned ON
    if (typeof renderAll === 'function') renderAll();
    else if (typeof renderPosts === 'function') renderPosts();
}

window.toggleAutoTranslate = toggleAutoTranslate;
window.updateAutoTranslateUI = updateAutoTranslateUI;

// Initialize Auto-Translate UI on load
document.addEventListener('DOMContentLoaded', () => {
    updateAutoTranslateUI();
});

// [OPTIMIZATION] Local cache for translated titles to avoid worker overhead on scroll/re-render
const titleTranslationCache = new Map();

// 🧵 Web Worker (Logic Thread) Manager
const LogicWorker = {
    worker: null,
    callbacks: new Map(),
    idCounter: 0,

    init() {
        if (this.worker) return;
        try {
            this.worker = new Worker('./worker.js?v=2026.01.28.2015');
            this.worker.onmessage = (e) => {
                const { id, result, error } = e.data;
                const callback = this.callbacks.get(id);
                if (callback) {
                    this.callbacks.delete(id);
                    if (error) callback.reject(new Error(error));
                    else callback.resolve(result);
                }
            };
            this.worker.onerror = (err) => console.error('LogicWorker Error:', err);

            // [NEW] Configure worker with DB credentials for global translation cache
            if (typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_KEY !== 'undefined' && !SUPABASE_URL.startsWith('VITE_')) {
                this.execute('SET_CONFIG', { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY });
            }

            console.log('LogicWorker (Logic Thread) ready.');
        } catch (e) {
            console.warn('LogicWorker init failed (fallback to main thread):', e);
        }
    },

    execute(type, payload, timeoutMs = 2000) {
        if (!this.worker) return Promise.reject('Worker not initialized');
        return new Promise((resolve, reject) => {
            const id = this.idCounter++;
            const timeout = setTimeout(() => {
                this.callbacks.delete(id);
                reject(new Error('LogicWorker timeout'));
            }, timeoutMs);

            this.callbacks.set(id, {
                resolve: (res) => { clearTimeout(timeout); resolve(res); },
                reject: (err) => { clearTimeout(timeout); reject(err); }
            });
            this.worker.postMessage({ type, payload, id });
        });
    }
};

// ==========================================
// 2. SESSION & STATE MANAGER
// ==========================================
const SessionManager = {
    KEYS: {
        AUTH: 'nano_dorothy_session',
        DRAFT_POST: 'nano_dorothy_draft_post',
        DRAFT_SIGNUP: 'nano_dorothy_draft_signup',
        UI_STATE: 'nano_dorothy_ui_state'
    },

    // Auth Session (Persistent)
    saveAuth(user) {
        const sessionData = {
            ...user,
            loginTime: Date.now(),
            expiresAt: Date.now() + (365 * 24 * 60 * 60 * 1000) // 365 days expiry (Persistent)
        };
        localStorage.setItem(this.KEYS.AUTH, JSON.stringify(sessionData));
    },
    getAuth() {
        const raw = localStorage.getItem(this.KEYS.AUTH);
        if (!raw) return null;
        const session = JSON.parse(raw);
        if (Date.now() > session.expiresAt) {
            this.clearAuth();
            return null;
        }
        return session;
    },
    clearAuth() {
        localStorage.removeItem(this.KEYS.AUTH);
    },

    // Draft Session (Temporary)
    saveDraft(key, data) {
        sessionStorage.setItem(key, JSON.stringify(data));
    },
    getDraft(key) {
        const raw = sessionStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    },
    clearDraft(key) {
        sessionStorage.removeItem(key);
    },

    // UI State (Persistent across refreshes)
    saveUIState(state) {
        const currentState = this.getUIState() || {};
        localStorage.setItem(this.KEYS.UI_STATE, JSON.stringify({ ...currentState, ...state }));
    },
    getUIState() {
        const raw = localStorage.getItem(this.KEYS.UI_STATE);
        return raw ? JSON.parse(raw) : null;
    }
};

// ==========================================
// 2. NOTIFICATION MANAGER
// ==========================================
const NotificationManager = {
    count: 0,
    isSoundOn: localStorage.getItem('nano_notif_sound') !== 'off',
    initialized: false,

    async init() {
        if (this.initialized) this.cleanup();
        this.updateBadge();
        this.updateButtons();
        this._subTimeout = setTimeout(() => this.setupSubscriptions(), 2000);
        this.initialized = true;
    },

    cleanup() {
        if (!this.initialized) return;
        if (this._subTimeout) clearTimeout(this._subTimeout);
        if (supabase) {
            supabase.removeChannel(supabase.channel('notif-posts'));
            supabase.removeChannel(supabase.channel('notif-comments'));
            supabase.removeChannel(supabase.channel('chat-notif'));
        }
        this.initialized = false;
    },

    setupSubscriptions() {
        if (!supabase) return;
        supabase.channel('notif-posts')
            .on('postgres_changes', { event: 'INSERT', table: 'posts' }, payload => this.notify('post', payload.new))
            .subscribe();
        supabase.channel('notif-comments')
            .on('postgres_changes', { event: 'INSERT', table: 'comments' }, payload => this.notify('comment', payload.new))
            .subscribe();
    },

    notify(type, data) {
        this.count++;
        if (this.count > 100) this.count = 100;
        this.updateBadge();
        this.playSound();
    },

    updateBadge() {
        const badge = document.getElementById('notif-badge');
        const display = document.getElementById('notif-count-display');
        const mobileBadge = document.getElementById('mobile-notif-badge');

        let mobileCountText = this.count;
        if (this.count > 10) {
            mobileCountText = 'x10';
        }

        // Desktop
        if (badge && display) {
            if (this.count > 0) {
                badge.classList.add('active');
                display.style.display = 'block';
                display.textContent = this.count > 99 ? '99+' : this.count;
            } else {
                badge.classList.remove('active');
                display.style.display = 'none';
            }
        }

        // Mobile
        if (mobileBadge) {
            mobileBadge.textContent = this.count > 0 ? mobileCountText : '';
            if (this.count > 0) {
                mobileBadge.classList.add('active');
            } else {
                mobileBadge.classList.remove('active');
            }
        }
    },

    updateButtons() {
        const btns = document.querySelectorAll('.notif-toggle-btn');
        btns.forEach(btn => {
            const isHeader = btn.id === 'notif-toggle-pc';
            if (this.isSoundOn) {
                btn.classList.add('on');
                btn.innerHTML = isHeader ? '🔔 ON' : LanguageManager.get('settings-notif-on');
            } else {
                btn.classList.remove('on');
                btn.innerHTML = isHeader ? '🔕 OFF' : LanguageManager.get('settings-notif-off');
            }
        });
    },

    playSound() {
        if (!this.isSoundOn) return;
        const audio = document.getElementById('notif-sound');
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(e => console.warn('Sound play blocked by browser policy. Interaction needed.'));
        }
    },

    clearNotifications() {
        this.count = 0;
        this.updateBadge();
    },

    toggleSound() {
        this.isSoundOn = !this.isSoundOn;
        localStorage.setItem('nano_notif_sound', this.isSoundOn ? 'on' : 'off');
        this.updateButtons();
    }
};

// Global Exposure for Notifications
window.NotificationManager = NotificationManager;
window.clearNotifications = () => NotificationManager.clearNotifications();
window.toggleNotifSound = () => NotificationManager.toggleSound();

// ==========================================
// 2. SUPABASE CONFIGURATION
// ==========================================
var SUPABASE_URL = 'VITE_SUPABASE_URL';
var SUPABASE_KEY = 'VITE_SUPABASE_KEY';
var R2_UPLOAD_BASE_URL = 'VITE_R2_UPLOAD_BASE_URL';

// ==========================================
// 2.5. PLAN / GATING (Free vs Pro, Admin override)
// ==========================================
function isProUser() {
    try {
        // Local override for testing:
        // localStorage.blog_plan_override = "free" | "pro"
        const o = String(localStorage.getItem('blog_plan_override') || '').toLowerCase();
        if (o === 'free') return false;
        if (o === 'pro') return true;
    } catch (_) { }

    // Super admin always has full access
    if (currentUser && currentUser.role === 'admin') return true;

    // Optional future column: users.plan = "pro"
    const plan = String((currentUser && currentUser.plan) || '').toLowerCase();
    if (plan === 'pro') return true;

    return false;
}

function canUploadImages() {
    return isProUser();
}

// --- R2 Upload Utility (via Cloudflare Worker) ---
async function uploadToR2(file, folder = 'blog') {
    if (!R2_UPLOAD_BASE_URL || String(R2_UPLOAD_BASE_URL).startsWith('VITE_')) {
        throw new Error('R2_UPLOAD_BASE_URL가 설정되지 않았습니다. Cloudflare Pages 환경변수에 R2_UPLOAD_BASE_URL을 추가하세요.');
    }
    const base = String(R2_UPLOAD_BASE_URL).replace(/\/+$/, '');
    const url = `${base}/upload?folder=${encodeURIComponent(folder)}`;

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-Filename': encodeURIComponent(file.name || 'upload.bin')
        },
        body: file
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data || !data.ok) {
        const errMsg = (data && data.error) || ('upload_failed (' + res.status + ')');
        throw new Error(errMsg);
    }
    return data.url;
}

// --- NEW: Storage Upload Utility (Supabase) ---
async function uploadToSupabase(file, bucket = 'uploads') {
    if (!supabase) throw new Error('Supabase not initialized');

    // 5MB Size Limit Check (Bypassed for Pro/Admin)
    if (file.size > 5242880 && !isProUser()) {
        throw new Error(`파일 크기가 5MB를 초과합니다. (현재: ${Math.round(file.size / 1024 / 1024 * 10) / 10}MB)`);
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    console.log(`[Upload] Attempting to upload to ${bucket}/${filePath} (${Math.round(file.size / 1024)}KB)`);

    const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, file);

    if (error) {
        console.error('Full Upload Error:', error);
        throw error;
    }

    const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

    return publicUrl;
}

// Initialize Client Immediate (Modules are awaited)
var supabase = null;
try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('Supabase initialized (ES Module).');
} catch (e) {
    console.error('Supabase Init Failed:', e);
}

// ==========================================
// 3. GLOBAL EXPOSURE (Early Binding)
// ==========================================
// We expose functions to window here so they are available to inline HTML even in Module mode.
window.init = () => init();
window.showDetail = (id) => showDetail(id);
window.openAuthModal = (mode) => openAuthModal(mode);
window.closeAuthModal = () => closeAuthModal();
window.toggleAuthMode = () => toggleAuthMode();
window.logout = () => logout();
window.loginWithOAuth = (provider) => loginWithOAuth(provider);
window.openAccountModal = () => openAccountModal();
window.closeAccountModal = () => closeAccountModal();
window.openModal = (post) => openModal(post);
window.closeModal = () => closeModal();
window.deleteCategory = (id) => deleteCategory(id);
window.renderUserManagement = () => renderUserManagement();
window.updateUserRole = (u, r) => updateUserRole(u, r);
window.addSocialLink = () => addSocialLink();
window.removeSocialLink = (id) => removeSocialLink(id);
window.renderAll = () => renderAll();
window.toggleOracleInsights = () => toggleOracleInsights();
window.toggleChat = () => toggleChat();
window.submitComment = (pid) => submitComment(pid);
window.deleteComment = (id) => deleteComment(id);
window.editComment = (id, content) => editComment(id, content);
window.handleReaction = (id, type) => handleReaction(id, type);
window.renderUserActivity = (tab) => renderUserActivity(tab);
window.openRecoveryModal = (mode) => openRecoveryModal(mode);
window.closeRecoveryModal = () => closeRecoveryModal();

// ==========================================
// 3. DOM ELEMENTS (Initialized in init)
// ==========================================
var grid = null;
var catList = null;
var postCatSelect = null;
var listView = null;
var detailView = null;
var detailContent = null;
var backBtn = null;
var adminToggle = null;
var newPostBtn = null;
var modal = null;
var form = null;
var closeBtn = null;
var userNav = null;
var authModal = null;
var authForm = null;
var adminOnlyActions = null;
var userActions = null;
var userMgrBtn = null;
var manageCatsBtn = null;
var catMgrSection = null;
var addCatBtn = null;
var newCatInput = null;
var catMgrList = null;

// Comments & Activity
var commentList = null;
var commentInput = null;
var submitCommentBtn = null;
var emojiPicker = null;
var activityContent = null;
var currentTab = 'my-posts';
var activePostId = null;

// Data
var comments = [];
const emoticons = ['😊', '😂', '😍', '🤔', '😎', '😭', '😮', '😡', '👍', '🔥', '✨', '🎨', '🚀', '🌈'];

// Account
var accountModal = null;
var accountForm = null;

function initializeDOMElements() {
    grid = document.getElementById('blog-grid');
    catList = document.getElementById('category-list');
    postCatSelect = document.getElementById('post-category');
    listView = document.getElementById('list-view');
    detailView = document.getElementById('detail-view');
    detailContent = document.getElementById('post-detail-content');
    backBtn = document.getElementById('back-to-list');
    adminToggle = document.getElementById('admin-toggle');
    newPostBtn = document.getElementById('new-post-btn');
    modal = document.getElementById('post-modal');
    form = document.getElementById('post-form');
    closeBtn = document.getElementById('close-modal');
    userNav = document.getElementById('hero-nav');
    authModal = document.getElementById('auth-modal');
    authForm = document.getElementById('auth-form');
    adminOnlyActions = document.getElementById('admin-only-actions');
    userActions = document.getElementById('user-actions');
    userMgrBtn = document.getElementById('user-mgr-btn');
    manageCatsBtn = document.getElementById('manage-cats-btn');
    catMgrSection = document.getElementById('cat-mgr-section');
    addCatBtn = document.getElementById('add-cat-btn');
    newCatInput = document.getElementById('new-cat-name');
    catMgrList = document.getElementById('cat-mgr-list');

    accountModal = document.getElementById('account-modal');
    accountForm = document.getElementById('account-form');

    commentList = document.getElementById('comment-list');
    commentInput = document.getElementById('comment-input');
    submitCommentBtn = document.getElementById('submit-comment-btn');
    emojiPicker = document.getElementById('emoticon-picker');
    activityContent = document.getElementById('activity-content');

    const recoveryForm = document.getElementById('recovery-form');
    if (recoveryForm) {
        recoveryForm.onsubmit = (e) => {
            e.preventDefault();
            handleRecoverySubmit();
        };
    }
}

// ==========================================
// 4. INITIALIZATION
// ==========================================

async function init() {
    console.log('Initializing Blog...');
    LogicWorker.init(); // [MULTI-THREAD] Start the Logic Thread

    // 1. Initialize Globals
    if (!posts) posts = [];
    if (!users) users = [];
    categories = [...defaultCats];

    // 2. DOM Elements
    initializeDOMElements();

    // 3. Setup Listeners
    setupEventListeners();
    setupBulkActions();
    setupMusic();

    // 4. Initial Render (Placeholder/Skeleton)
    restoreUIState();
    await checkSession();
    renderAll();
    restoreDrafts();
    initChatbot();
    initEmoticonPicker();
    setupActivityTabs();

    // Initialize Notifications (Non-blocking)
    setTimeout(() => NotificationManager.init(), 500);

    // [NEW] Initialize Localization
    LanguageManager.init();

    // Sync settings-lang-select with current language
    const langSelect = document.getElementById('settings-lang-select');
    if (langSelect) langSelect.value = LanguageManager.currentLang;

    // [NEW] Health Checks & Update Polling
    checkServerHealth();
    checkAppUpdate();
    setInterval(checkServerHealth, 30000); // 30s
    setInterval(checkAppUpdate, 30000); // [MOD] Increased frequency for better detection (30s)

    if (supabase) {
        try {
            console.log('Fetching data in parallel...');
            // Parallelize initial data fetch
            await Promise.all([
                loadData(),
                updateSubscriberCount()
            ]);

            await checkSession();
            renderAll();

            // [NEW] Setup Realtime Auth Listener for OAuth Sync
            supabase.auth.onAuthStateChange(async (event, session) => {
                console.log(`Auth event: ${event}`);
                if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                    await checkSession();
                    renderAll();
                } else if (event === 'SIGNED_OUT') {
                    SessionManager.clearAuth();
                    currentUser = null;
                    isAdminMode = false;
                    renderAll();
                }
            });

            // Success indicator (Simplified & Admin Only)
            const statusDiv = document.getElementById('db-status-indicator');
            if (statusDiv) {
                statusDiv.innerHTML = '🟢 Cloud Mode';
                statusDiv.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
                statusDiv.style.color = '#00ff00';
                statusDiv.style.border = '1px solid #00ff00';
                statusDiv.style.display = isAdminMode ? 'block' : 'none';
            }

        } catch (err) {
            console.error('Data load error:', err);
        }
    }
}

async function updateSubscriberCount() {
    const subscriberCountEl = document.getElementById('subscriber-count');
    if (!subscriberCountEl) return;

    if (supabase) {
        try {
            const { count, error } = await supabase
                .from('users')
                .select('*', { count: 'exact', head: true });

            if (!error && count !== null) {
                subscriberCountEl.innerText = count.toLocaleString();
            }
        } catch (e) {
            console.warn('Failed to fetch subscriber count:', e);
        }
    } else {
        // Fallback to local storage users array if local mode
        const localUsers = JSON.parse(localStorage.getItem('users') || '[]');
        subscriberCountEl.innerText = localUsers.length.toLocaleString();
    }
}
window.init = init; // Redundant but safe

// ==========================================
// 5. DATA FETCHING (SUPABASE)
// ==========================================
async function loadData() {
    if (!supabase) return;

    try {
        const promises = [
            supabase.from('posts').select('*').order('created_at', { ascending: false }).range(0, 100),
            supabase.from('social_links').select('*').order('id', { ascending: true })
        ];

        if (isAdminMode) {
            promises.push(supabase.from('users').select('*').limit(500));
        }

        const results = await Promise.all(promises);

        // Posts Result
        const { data: postData, error: postError } = results[0];
        if (postError) throw postError;
        posts = postData && postData.length > 0 ? postData : [];

        // Social Links Result
        const { data: linkData, error: linkError } = results[1];
        if (!linkError) socialLinks = linkData || [];

        // Users Result (Admin Only)
        if (isAdminMode && results[2]) {
            const { data: userData, error: userError } = results[2];
            if (!userError && userData) users = userData;
        }

        toggleMaintenanceMode(false);
    } catch (err) {
        console.error('Data load error:', err);
        toggleMaintenanceMode(true);
    }
}

// --- Health & Update Logic [NEW] ---
async function checkServerHealth() {
    if (!supabase) return;
    try {
        const { error } = await supabase.from('posts').select('id', { count: 'exact', head: true }).limit(1);
        if (error) throw error;
        toggleMaintenanceMode(false);
    } catch (e) {
        console.warn('Health check failed:', e);
        toggleMaintenanceMode(true);
    }
}

function toggleMaintenanceMode(isDown) {
    const overlay = document.getElementById('maintenance-overlay');
    if (!overlay) return;
    isServerDown = isDown;
    overlay.style.display = isDown ? 'flex' : 'none';
}

async function checkAppUpdate() {
    try {
        const res = await fetch('./version.json?t=' + Date.now());
        const data = await res.json();
        if (data && data.version && data.version !== APP_VERSION) {
            console.log('[UPDATE] New version available:', data.version, '(Current:', APP_VERSION, ')');
            const updatePrompt = document.getElementById('update-notification');
            if (updatePrompt) updatePrompt.style.display = 'flex';
        } else {
            console.log('[DEBUG] App version is current:', APP_VERSION);
        }
    } catch (e) {
        // Silent fail for version check
    }
}


// ==========================================
// 6. AUTHENTICATION
// ==========================================
async function checkSession() {
    // 1. Check local session first
    currentUser = SessionManager.getAuth();

    // 2. [OAuth Sync] If no local session, check Supabase Auth
    if (!currentUser && supabase) {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session && session.user) {
                console.log('OAuth Session detected, syncing...');
                const user = session.user;
                const nickname = user.user_metadata.full_name || user.user_metadata.name || user.email.split('@')[0];

                // Construct session user object
                const syncUser = {
                    username: user.email,
                    nickname: nickname,
                    role: 'user', // Default, trigger will handle database role
                    uid: user.id
                };

                // Check DB for actual role (Admin Check)
                const { data: dbUser } = await supabase.from('users').select('role').eq('username', user.email).single();
                if (dbUser) syncUser.role = dbUser.role;

                SessionManager.saveAuth(syncUser);
                currentUser = syncUser;

                // [NEW] Restore Language Preference from DB if available
                if (user.user_metadata.language) {
                    LanguageManager.setLanguage(user.user_metadata.language);
                    const langSelect = document.getElementById('settings-lang-select');
                    if (langSelect) langSelect.value = LanguageManager.currentLang;
                }

                console.log('OAuth Session synced successfully.');
            }
        } catch (e) {
            console.error('OAuth sync error:', e);
        }
    }

    isAdminMode = currentUser && currentUser.role === 'admin';
    updateUserNav();
}

function restoreUIState() {
    const state = SessionManager.getUIState();
    if (state) {
        if (state.category) currentCategory = state.category;
        if (state.page) currentPage = state.page;

        // [NEW] Persist Settings
        if (state.fontScale) {
            document.documentElement.style.setProperty('--mobile-font-scale', state.fontScale);
        }
        if (state.layoutScale) {
            document.documentElement.style.setProperty('--mobile-layout-scale', state.layoutScale + '%');
        }
        if (state.layoutHeight) {
            document.documentElement.style.setProperty('--mobile-layout-height', state.layoutHeight + '%');
        }
    }
}

function restoreDrafts() {
    // Post Draft
    const postDraft = SessionManager.getDraft(SessionManager.KEYS.DRAFT_POST);
    if (postDraft && form) {
        form.title.value = postDraft.title || '';
        form.content.value = postDraft.content || '';
        form['post-category'].value = postDraft.category || 'board';
        console.log('Post draft restored.');
    }
}

function updateUserNav() {
    if (!userNav) {
        userNav = document.getElementById('hero-nav');
        if (!userNav) return;
    }

    if (currentUser) {
        userNav.innerHTML = `
            <a href="javascript:void(0)" onclick="renderAll()" class="active">${LanguageManager.get('nav-records')}</a>
            <a href="anticode.html" style="color:var(--futuristic-accent); font-weight:900;">${LanguageManager.get('nav-chat')}</a>
            <a href="javascript:void(0)" onclick="alert('일지 준비중입니다.')">${LanguageManager.get('nav-journal')}</a>
            <span class="user-info-text">${currentUser.nickname}${LanguageManager.get('msg-dear')}</span>
            <a href="javascript:void(0)" onclick="openAccountModal()" class="user-action-link">${LanguageManager.get('nav-account')}</a>
            <a href="javascript:void(0)" onclick="logout()" class="logout-link">${LanguageManager.get('nav-logout')}</a>
        `;
        if (adminOnlyActions) adminOnlyActions.style.display = currentUser.role === 'admin' ? 'block' : 'none';
        if (userActions) userActions.style.display = 'flex';
        if (newPostBtn) newPostBtn.style.display = 'block';
        if (userMgrBtn) userMgrBtn.style.display = isAdminMode ? 'block' : 'none';
    } else {
        userNav.innerHTML = `
            <a href="javascript:void(0)" onclick="renderAll()" class="active">${LanguageManager.get('nav-records')}</a>
            <a href="anticode.html" style="color:var(--futuristic-accent); font-weight:900;">${LanguageManager.get('nav-chat')}</a>
            <a href="javascript:void(0)" onclick="alert('일지 준비중입니다.')">${LanguageManager.get('nav-journal')}</a>
            <a href="javascript:void(0)" onclick="openAuthModal('login')">${LanguageManager.get('nav-login')}</a>
            <a href="javascript:void(0)" onclick="openAuthModal('signup')">${LanguageManager.get('nav-signup')}</a>
        `;
        if (adminOnlyActions) adminOnlyActions.style.display = 'none';
        if (userActions) userActions.style.display = 'flex';
        if (newPostBtn) newPostBtn.style.display = 'block';
        if (userMgrBtn) userMgrBtn.style.display = 'none';
        isAdminMode = false;
    }

    // After updating nav, check if we should show the admin status indicator
    const statusIndicator = document.getElementById('db-status-indicator');
    if (statusIndicator) {
        statusIndicator.style.display = isAdminMode ? 'block' : 'none';
    }

    // Show notification toggle on PC
    const notifTogglePc = document.getElementById('notif-toggle-pc');
    if (notifTogglePc) {
        notifTogglePc.style.display = 'flex';
    }

    renderPosts();
    updateBulkUI();
}

async function logout() {
    if (!confirm('로그아웃 하시겠습니까?')) return;

    // 1. Clear Local Auth
    SessionManager.clearAuth();
    currentUser = null;
    isAdminMode = false;

    // 2. Supabase Logout (if initialized)
    if (supabase) {
        try {
            await supabase.auth.signOut();
        } catch (e) {
            console.warn('Supabase logout error:', e);
        }
    }

    checkSession();
    renderAll();
}

async function loginWithOAuth(provider) {
    if (!supabase) return alert('Supabase 서비스가 활성화되지 않았습니다.');

    console.log(`Initiating OAuth login with ${provider}...`);
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: provider,
        options: {
            redirectTo: window.location.origin
        }
    });

    if (error) {
        alert(`${provider} 로그인 중 오류가 발생했습니다: ${error.message}`);
    }
}

// Auth Handlers
let authMode = 'login';
// Auth Handlers
function openAuthModal(mode) {
    if (!authModal || !authForm) {
        authModal = document.getElementById('auth-modal');
        authForm = document.getElementById('auth-form');
    }
    if (!authModal) { console.error('Auth modal element missing!'); return; }

    authMode = mode;
    authModal.classList.add('active');

    const title = document.getElementById('auth-modal-title');
    const btn = document.getElementById('auth-submit-btn');
    const group = document.getElementById('signup-nickname-group');
    const consentGroup = document.getElementById('signup-consent-group');
    const switchTxt = document.getElementById('auth-switch-text');
    const switchLnk = document.getElementById('auth-switch-link');
    const countryGroup = document.getElementById('signup-country-group'); // Assuming these exist now
    const langGroup = document.getElementById('signup-lang-group'); // Assuming these exist now

    if (title) title.textContent = mode === 'login' ? '로그인' : '회원가입';
    if (btn) btn.textContent = mode === 'login' ? '접속하기' : '가입하기';
    if (group) group.style.display = mode === 'signup' ? 'block' : 'none';
    if (consentGroup) consentGroup.style.display = mode === 'signup' ? 'block' : 'none';
    if (countryGroup) countryGroup.style.display = mode === 'signup' ? 'block' : 'none';
    if (langGroup) langGroup.style.display = mode === 'signup' ? 'block' : 'none';
    if (switchTxt) switchTxt.textContent = mode === 'login' ? '계정이 없으신가요?' : '이미 계정이 있으신가요?';
    if (switchLnk) switchLnk.textContent = mode === 'login' ? '회원가입' : '로그인';

    if (authForm) {
        authForm.reset();
        if (mode === 'signup') {
            const signupDraft = SessionManager.getDraft(SessionManager.KEYS.DRAFT_SIGNUP);
            if (signupDraft) {
                const uInput = document.getElementById('auth-username');
                const nInput = document.getElementById('auth-nickname');
                const cInput = document.getElementById('auth-country');
                const lInput = document.getElementById('auth-lang');
                if (uInput) uInput.value = signupDraft.username || '';
                if (nInput) nInput.value = signupDraft.nickname || '';
                if (cInput) cInput.value = signupDraft.country || '';
                if (lInput) lInput.value = signupDraft.language || LanguageManager.currentLang;
            }
        }
    }
}
function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.remove('active');
}
function toggleAuthMode() {
    openAuthModal(authMode === 'login' ? 'signup' : 'login');
}

// --- Account Recovery Handlers [NEW] ---
let recoveryMode = 'id'; // 'id' or 'pw'
function openRecoveryModal(mode) {
    recoveryMode = mode;
    const modal = document.getElementById('recovery-modal');
    const title = document.getElementById('recovery-modal-title');
    const userGroup = document.getElementById('recovery-username-group');
    const resBox = document.getElementById('recovery-result');
    const nickInp = document.getElementById('recovery-nickname');
    const userInp = document.getElementById('recovery-username');

    if (!modal) return;
    modal.classList.add('active');
    if (resBox) resBox.style.display = 'none';
    if (nickInp) nickInp.value = '';
    if (userInp) userInp.value = '';

    if (title) title.textContent = mode === 'id' ? 'FIND ID' : 'FIND PASSWORD';
    if (userGroup) userGroup.style.display = mode === 'pw' ? 'block' : 'none';
}

function closeRecoveryModal() {
    const modal = document.getElementById('recovery-modal');
    if (modal) modal.classList.remove('active');
}

async function handleRecoverySubmit() {
    const nick = document.getElementById('recovery-nickname').value.trim();
    const username = document.getElementById('recovery-username').value.trim();
    const resBox = document.getElementById('recovery-result');

    if (!nick) return alert('닉네임을 입력해주세요.');
    if (recoveryMode === 'pw' && !username) return alert('아이디를 입력해주세요.');

    try {
        let foundUser = null;
        if (supabase) {
            let query = supabase.from('users').select('username, password').eq('nickname', nick);
            if (recoveryMode === 'pw') query = query.eq('username', username);

            const { data, error } = await query.maybeSingle();
            if (error) throw error;
            foundUser = data;
        } else {
            // Local fallback
            foundUser = users.find(u => {
                const nickMatch = u.nickname === nick;
                if (recoveryMode === 'pw') return nickMatch && u.username === username;
                return nickMatch;
            });
        }

        if (resBox) {
            resBox.style.display = 'block';
            if (foundUser) {
                if (recoveryMode === 'id') {
                    // Masking ID for security? No, the user asked to "find" it. Let's show it or partial.
                    // The user said "Find ID, Find Password", so I'll show it but maybe masked if it's sensitive.
                    // Given the request style, I'll just show it.
                    resBox.innerHTML = `찾으시는 아이디는: <strong>${foundUser.username}</strong> 입니다.`;
                } else {
                    resBox.innerHTML = `비밀번호는: <strong>${foundUser.password}</strong> 입니다.`;
                }
            } else {
                resBox.innerHTML = `<span style="color:#ff007a;">일치하는 정보가 없습니다.</span>`;
            }
        }
    } catch (err) {
        console.error('Recovery error:', err);
        alert('조회 중 오류가 발생했습니다.');
    }
}



// ==========================================
// 7. POST ACTIONS (CRUD)
// ==========================================


// Handled below in unified actions

// Handled below

// ==========================================
// 8. ADMIN USER MANAGEMENT
// ==========================================
// Handled below

// ==========================================
// 9. RENDERING LOGIC
// ==========================================
function renderAll() {
    renderCategories();
    renderBestPosts();
    renderPosts();
    renderCatManager();
    renderSocialLinks();
    updateBulkUI();
}

async function renderBestPosts() {
    const bestGrid = document.getElementById('best-grid');
    if (!bestGrid) return;
    if (currentCategory !== 'all') {
        bestGrid.style.display = 'none';
        document.querySelector('.best-header').style.display = 'none';
        return;
    }
    bestGrid.style.display = 'grid';
    document.querySelector('.best-header').style.display = 'flex';
    bestGrid.innerHTML = '';

    const topPosts = [...posts].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 3);

    for (const [index, post] of topPosts.entries()) {
        const cat = categories.find(c => c.id === post.category);
        const catName = cat ? (cat.i18n ? LanguageManager.get(cat.i18n) : cat.name.split(' (')[0]) : LanguageManager.get('cat-uncategorized');
        const card = document.createElement('div');
        card.className = 'blog-card';
        card.onclick = () => showDetail(post.id);

        let displayTitle = post.title || '';
        const cacheKey = post.id + LanguageManager.currentLang;
        const autoTrans = localStorage.getItem('app_auto_translate') === 'true';

        if (autoTrans && LanguageManager.currentLang !== 'ko') {
            if (titleTranslationCache.has(cacheKey)) {
                displayTitle = titleTranslationCache.get(cacheKey);
            } else {
                displayTitle = `<span style="display:inline-block; color:var(--accent-main); opacity:0.6; font-style:italic; animation: translatePulse_Local 1.5s infinite ease-in-out; pointer-events:none;">${LanguageManager.get('msg-translating') || 'Translating...'}</span>
                                <style>@keyframes translatePulse_Local { 0%, 100% { opacity: 0.4; transform: scale(0.98); } 50% { opacity: 0.8; transform: scale(1.02); } }</style>`;
                LogicWorker.execute('TRANSLATE', { text: post.title, targetLang: LanguageManager.currentLang })
                    .then(res => {
                        if (res && res.translatedText) {
                            titleTranslationCache.set(cacheKey, res.translatedText);
                            const titleEl = card.querySelector('h2');
                            if (titleEl) titleEl.innerText = res.translatedText.length > 20 ? res.translatedText.substring(0, 20) + '...' : res.translatedText;
                        }
                    }).catch(err => {
                        console.error('Best posts translation failed:', err);
                        const titleEl = card.querySelector('h2');
                        if (titleEl) titleEl.innerText = post.title.length > 20 ? post.title.substring(0, 20) + '...' : post.title;
                    });
            }
        }

        const truncatedTitle = displayTitle.length > 20 ? displayTitle.substring(0, 20) + '...' : displayTitle;
        card.innerHTML = `
            <div class="rank-badge">0${index + 1}</div>
            <div style="cursor:pointer;" title="${post.title}">
                <span class="cat-tag">${catName}</span>
                <h2>${truncatedTitle}</h2>
                <div class="item-meta">
                    <span>${post.author}</span>
                    <span>${post.date}</span>
                    <span class="view-count">${LanguageManager.get('detail-views') || 'Views'} ${post.views || 0}</span>
                </div>
            </div>
        `;
        bestGrid.appendChild(card);
    }
}
function renderCategories() {
    if (!catList) return;
    catList.innerHTML = `<li><a class="cat-item ${currentCategory === 'all' ? 'active' : ''}" data-id="all">${LanguageManager.get('cat-all')}</a></li>`;
    categories.forEach(cat => {
        const displayName = cat.i18n ? LanguageManager.get(cat.i18n) : (cat.name || cat.id);
        catList.innerHTML += `<li><a class="cat-item ${currentCategory === cat.id ? 'active' : ''}" data-id="${cat.id}">${displayName}</a></li>`;
    });
    if (isAdminMode) {
        catList.innerHTML += `<li><a class="cat-item user-mgr-cat ${currentCategory === 'users-mgr' ? 'active' : ''}" data-id="users-mgr" style="color:#d32f2f; font-weight:bold;">${LanguageManager.get('admin-user-mgr')}</a></li>`;
    }
    if (postCatSelect) {
        postCatSelect.innerHTML = '';
        categories.forEach(cat => {
            const displayName = cat.i18n ? LanguageManager.get(cat.i18n) : (cat.name || cat.id);
            postCatSelect.innerHTML += `<option value="${cat.id}">${displayName}</option>`;
        });
    }
    document.querySelectorAll('.cat-item').forEach(el => {
        el.onclick = () => {
            currentCategory = el.dataset.id;
            currentPage = 1; // Reset to page 1 on category change
            SessionManager.saveUIState({ category: currentCategory, page: currentPage });
            listView.style.display = 'block';
            detailView.style.display = 'none';
            selectedPostIds.clear();
            if (currentCategory === 'users-mgr') renderUserManagement();
            else renderAll();
        };
    });
}

// ==========================================
// 8. ADMIN & USER MANAGEMENT
// ==========================================
async function renderUserManagement() {
    // Security Check
    if (!currentUser || currentUser.role !== 'admin') {
        alert('접근 권한이 없습니다.');
        listView.style.display = 'block';
        return;
    }

    // Force refresh data to get latest users
    await loadData();

    grid.innerHTML = `
        <div class="admin-section-title">
            <h2>${LanguageManager.get('admin-user-mgr-title')}</h2>
            <p>${LanguageManager.get('admin-user-mgr-desc')}</p>
            <button onclick="renderUserManagement()" class="sm-action-btn" style="margin-top:10px;">🔄 ${LanguageManager.get('btn-refresh')}</button>
        </div>
    `;

    const table = document.createElement('table');
    table.className = 'user-mgr-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>닉네임</th>
                <th>아이디</th>
                <th>비밀번호</th>
                <th>권한</th>
                <th>관리</th>
            </tr>
        </thead>
        <tbody>
            ${users.map(u => `
                <tr>
                    <td>${u.nickname}</td>
                    <td>${u.username}</td>
                    <td>${u.password}</td>
                    <td>
                        <select onchange="updateUserRole('${u.username}', this.value)" ${u.username === currentUser.username ? 'disabled' : ''}>
                            <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
                            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                        </select>
                    </td>
                    <td>
                        ${u.username !== currentUser.username ?
            `<button onclick="deleteUser('${u.username}')" class="danger-btn-sm">삭제</button>` :
            '<span class="badge">나</span>'}
                    </td>
                </tr>
            `).join('')}
        </tbody>
    `;
    grid.appendChild(table);
    if (document.getElementById('admin-bulk-controls')) document.getElementById('admin-bulk-controls').style.display = 'none';
}

function renderPosts() {
    if (!grid) return;

    // Hard clear the grid
    while (grid.firstChild) {
        grid.removeChild(grid.firstChild);
    }

    let filtered = currentCategory === 'all' ? posts : posts.filter(p => p.category === currentCategory);

    // [MOBILE] Search Filter
    if (window.mobileSearchKeyword) {
        const kw = window.mobileSearchKeyword.toLowerCase();
        filtered = filtered.filter(p =>
            p.title.toLowerCase().includes(kw) ||
            (p.content && p.content.toLowerCase().includes(kw))
        );
    }

    // Debug UI: Show count in header if exists
    const feedHeader = document.querySelector('.list-header h2');
    if (feedHeader) {
        feedHeader.innerHTML = `FEEDS <span style="font-size:0.6rem; opacity:0.5;">(${filtered.length} ${LanguageManager.get('status-posts')})</span>`;
    }

    // Forced Pagination Logic
    const limit = 12;
    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const currPage = Math.max(1, parseInt(currentPage) || 1);
    const start = (currPage - 1) * limit;
    const end = start + limit;
    const pagedPosts = filtered.slice(start, end);

    console.log(`[PAGINATION] Total: ${total}, Page: ${currPage}/${totalPages}, Showing: ${pagedPosts.length}`);

    if (total === 0) {
        grid.innerHTML = `<div style="text-align:center; padding:50px; color:#aaa;">${LanguageManager.get('status-no-posts')}</div>`;
        const pgContainer = document.getElementById('pagination-container');
        if (pgContainer) pgContainer.innerHTML = '';
        return;
    }

    pagedPosts.forEach(post => {
        const cat = categories.find(c => c.id === post.category);
        const catName = cat ? (cat.i18n ? LanguageManager.get(cat.i18n) : cat.name.split(' (')[0]) : LanguageManager.get('cat-uncategorized');
        const isSelected = selectedPostIds.has(post.id);
        const isAuthor = currentUser && currentUser.nickname === post.author;
        const item = document.createElement('div');
        item.className = `title-item ${isSelected ? 'selected' : ''}`;

        let displayTitle = post.title || '';
        const cacheKey = post.id + LanguageManager.currentLang;
        const autoTrans = localStorage.getItem('app_auto_translate') === 'true';

        if (autoTrans && LanguageManager.currentLang !== 'ko') {
            if (titleTranslationCache.has(cacheKey)) {
                displayTitle = titleTranslationCache.get(cacheKey);
            } else {
                displayTitle = `<span style="display:inline-block; color:var(--accent-main); opacity:0.6; font-style:italic; animation: translatePulse_Local 1.5s infinite ease-in-out; pointer-events:none;">${LanguageManager.get('msg-translating') || 'Translating...'}</span>
                                <style>@keyframes translatePulse_Local { 0%, 100% { opacity: 0.4; transform: scale(0.98); } 50% { opacity: 0.8; transform: scale(1.02); } }</style>`;
                LogicWorker.execute('TRANSLATE', { text: post.title, targetLang: LanguageManager.currentLang })
                    .then(res => {
                        if (res && res.translatedText) {
                            titleTranslationCache.set(cacheKey, res.translatedText);
                            const titleEl = item.querySelector('h2');
                            if (titleEl) titleEl.innerText = res.translatedText.length > 20 ? res.translatedText.substring(0, 20) + '...' : res.translatedText;
                        }
                    }).catch(err => {
                        console.error('Posts translation failed:', err);
                        const titleEl = item.querySelector('h2');
                        if (titleEl) titleEl.innerText = post.title.length > 20 ? post.title.substring(0, 20) + '...' : post.title;
                    });
            }
        }

        const truncatedTitle = displayTitle.length > 20 ? displayTitle.substring(0, 20) + '...' : displayTitle;

        item.innerHTML = `
            ${isAdminMode ? `<input type="checkbox" class="item-checkbox" ${isSelected ? 'checked' : ''} data-id="${post.id}">` : ''}
            <div class="title-item-inner" onclick="showDetail(${post.id}); updateUserIntel({ last_viewed_post: ${post.id}, last_category: '${post.category}' });" style="cursor:pointer; width: 100%; display: flex; justify-content: space-between; align-items: center;">
                <div style="flex: 1;" title="${post.title}">
                    <span class="cat-tag">${catName}</span>
                    <h2 style="pointer-events:none;">${truncatedTitle}</h2>
                    <div class="item-meta">
                        <span>${post.author}</span>
                        <span>${post.date}</span>
                        <span class="view-count">${LanguageManager.get('detail-views') || 'Views'} ${post.views || 0}</span>
                    </div>
                </div>
                ${isAuthor ? `
                <div class="item-inline-actions" onclick="event.stopPropagation()">
                    <button onclick="editPostAction(${post.id})" class="inline-action-btn">${LanguageManager.get('btn-edit')}</button>
                    <button onclick="deletePostAction(${post.id})" class="inline-action-btn delete">${LanguageManager.get('btn-delete')}</button>
                </div>` : ''}
            </div>
        `;
        if (isAdminMode) {
            const cb = item.querySelector('.item-checkbox');
            if (cb) cb.onclick = (e) => { e.stopPropagation(); toggleSelection(post.id); };
        }
        grid.appendChild(item);
    });

    renderPagination(totalPages);
}

function renderPagination(total) {
    const container = document.getElementById('pagination-container');
    if (!container) return;
    container.innerHTML = '';

    const pageCount = Math.max(1, total);
    const curr = parseInt(currentPage);

    // Prev Button
    if (curr > 1) {
        const prevBtn = document.createElement('button');
        prevBtn.className = 'page-btn nav-btn';
        prevBtn.innerHTML = '❮';
        prevBtn.onclick = () => {
            currentPage = curr - 1;
            SessionManager.saveUIState({ page: currentPage });
            window.scrollTo({ top: 400, behavior: 'smooth' });
            renderPosts();
        };
        container.appendChild(prevBtn);
    }

    // Page Numbers
    for (let i = 1; i <= pageCount; i++) {
        const btn = document.createElement('button');
        btn.className = `page-btn ${i === curr ? 'active' : ''}`;
        btn.textContent = i;
        btn.onclick = () => {
            currentPage = i;
            SessionManager.saveUIState({ page: currentPage });
            window.scrollTo({ top: 400, behavior: 'smooth' });
            renderPosts();
        };
        container.appendChild(btn);
    }

    // Next Button
    if (curr < pageCount) {
        const nextBtn = document.createElement('button');
        nextBtn.className = 'page-btn nav-btn';
        nextBtn.innerHTML = '❯';
        nextBtn.onclick = () => {
            currentPage = curr + 1;
            SessionManager.saveUIState({ page: currentPage });
            window.scrollTo({ top: 400, behavior: 'smooth' });
            renderPosts();
        };
        container.appendChild(nextBtn);
    }
}

function showDetail(id) {
    const post = posts.find(p => p.id == id);
    if (!post) return;

    post.views = (post.views || 0) + 1;
    if (supabase) supabase.from('posts').update({ views: post.views }).eq('id', id).then();

    listView.style.display = 'none';
    detailView.style.display = 'block';
    window.scrollTo({ top: 400, behavior: 'smooth' });

    const isAuthor = currentUser && currentUser.nickname === post.author;
    const canManage = isAdminMode || isAuthor;
    const foundCat = categories.find(function (c) { return c.id === post.category; });
    const catName = foundCat ? (foundCat.i18n ? LanguageManager.get(foundCat.i18n) : foundCat.name.split(' (')[0]) : LanguageManager.get('cat-uncategorized');

    detailContent.innerHTML = `
        <header class="detail-header">
            <span class="tag">${catName} ${LanguageManager.get('detail-archive') || 'Archive'}</span>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h1 id="post-detail-title">${post.title}</h1>
            </div>
            <div class="detail-meta">
                <span>${post.author} ${LanguageManager.get('detail-published') || 'Published'}</span>
                <span>${post.date}</span>
                <span class="view-count">${LanguageManager.get('detail-views') || 'Views'} ${post.views}</span>
            </div>
        </header>
        ${post.img ? `<div class="post-img-container"><img src="${post.img}" alt="본문 이미지"></div>` : ''}
        <div class="post-body" id="post-detail-body">${post.content.replace(/\n/g, '<br>')}</div>
        <div class="post-footer">
            ${canManage ? `<button onclick="editPostAction(${post.id})" class="action-btn">${LanguageManager.get('btn-edit')}</button><button onclick="deletePostAction(${post.id})" class="action-btn">${LanguageManager.get('btn-delete')}</button>` : ''}
        </div>
    `;

    // [NEW] Automatic Post Translation
    const autoTrans = localStorage.getItem('app_auto_translate') === 'true';
    if (autoTrans && LanguageManager.currentLang !== 'ko') {
        setTimeout(() => translatePost(id), 100);
    }

    // Load and render comments
    loadComments(id);
}
window.showDetail = showDetail;

async function translatePost(id) {
    const post = posts.find(p => p.id == id);
    if (!post) return;
    const targetLang = LanguageManager.currentLang;
    const btn = document.querySelector('.detail-header button');
    if (btn) btn.disabled = true;

    try {
        const titleEl = document.getElementById('post-detail-title');
        const bodyEl = document.getElementById('post-detail-body');

        if (titleEl) {
            const res = await LogicWorker.execute('TRANSLATE', { text: post.title, targetLang });
            if (res && res.translatedText) titleEl.innerText = res.translatedText;
        }
        if (bodyEl) {
            const res = await LogicWorker.execute('TRANSLATE', { text: post.content, targetLang });
            if (res && res.translatedText) bodyEl.innerHTML = res.translatedText.replace(/\n/g, '<br>');
        }
    } catch (e) {
        console.error('Translation failed:', e);
    } finally {
        if (btn) btn.disabled = false;
    }
}
window.translatePost = translatePost;

// ==========================================
// 10. UTILS & SETUP
// ==========================================
function toggleSelection(id) {
    if (selectedPostIds.has(id)) selectedPostIds.delete(id); else selectedPostIds.add(id);
    renderPosts(); updateBulkUI();
}

function updateBulkUI() {
    const bulkBar = document.getElementById('admin-bulk-controls');
    const countLabel = document.getElementById('selected-count');
    const editBtn = document.getElementById('bulk-edit-btn');
    if (!bulkBar) return;

    if (isAdminMode && selectedPostIds.size > 0) {
        bulkBar.style.display = 'flex';
        countLabel.textContent = `${selectedPostIds.size}개 선택됨`;
        if (selectedPostIds.size === 1) { editBtn.style.opacity = '1'; editBtn.dataset.id = Array.from(selectedPostIds)[0]; }
        else { editBtn.style.opacity = '0.5'; editBtn.dataset.id = ''; }
    } else { bulkBar.style.display = 'none'; }
}

function setupAdmin() {
    // Admin features are now automated based on user role.
};
window.setupAdmin = setupAdmin;

function setupMusic() {
    const bgmAudio = document.getElementById('bgm-audio');
    const bgmToggle = document.getElementById('bgm-toggle');
    const bgmText = document.getElementById('bgm-status-text');
    if (!bgmAudio || !bgmToggle) return;
    bgmToggle.onclick = () => {
        if (bgmAudio.paused) {
            bgmAudio.play().then(() => {
                bgmToggle.classList.add('playing');
                bgmText.textContent = 'MUSIC ON';
            }).catch(err => { console.error(err); alert('자동 재생 차단됨. 다시 눌러주세요.'); });
        } else {
            bgmAudio.pause();
            bgmToggle.classList.remove('playing');
            bgmText.textContent = 'MUSIC OFF';
        }
    };
}

function setupBulkActions() {
    const selectAll = document.getElementById('select-all-posts');
    if (selectAll) selectAll.onchange = (e) => {
        const currentItems = currentCategory === 'all' ? posts : posts.filter(p => p.category === currentCategory);
        if (e.target.checked) currentItems.forEach(p => selectedPostIds.add(p.id)); else currentItems.forEach(p => selectedPostIds.delete(p.id));
        renderPosts(); updateBulkUI();
    };

    const bulkEdit = document.getElementById('bulk-edit-btn');
    if (bulkEdit) bulkEdit.onclick = () => {
        const id = bulkEdit.dataset.id;
        if (id) openModal(posts.find(p => p.id == id)); else alert('하나만 선택해주세요.');
    };

    const bulkDelete = document.getElementById('bulk-delete-btn');
    if (bulkDelete) bulkDelete.onclick = async () => {
        if (selectedPostIds.size > 0 && confirm('삭제하시겠습니까?')) {
            const idsToDelete = Array.from(selectedPostIds);
            if (supabase) await supabase.from('posts').delete().in('id', idsToDelete);
            else posts = posts.filter(p => !selectedPostIds.has(p.id));

            selectedPostIds.clear();
            await loadData();
            renderAll();
        }
    };
    const clearSel = document.getElementById('clear-selection-btn');
    if (clearSel) clearSel.onclick = () => { selectedPostIds.clear(); renderPosts(); updateBulkUI(); };
}

function setupEventListeners() {
    // ==========================================
    // Unified Event Listeners (Safe Binding)
    // ==========================================
    // Post Form Submit
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            if (!currentUser) return alert('로그인 필요');

            const id = document.getElementById('post-id').value;
            const title = document.getElementById('post-title').value;
            const content = document.getElementById('post-content').value;
            const category = document.getElementById('post-category').value;
            let img = document.getElementById('post-img').value;

            // [NEW] Upload file if selected
            const fileInput = document.getElementById('post-file-input');
            if (fileInput && fileInput.files[0]) {
                try {
                    const postBtn = e.target.querySelector('button[type="submit"]');
                    const originalText = postBtn.textContent;
                    postBtn.textContent = 'UPLOADING...';
                    postBtn.disabled = true;

                    img = await uploadToSupabase(fileInput.files[0], 'uploads');

                    postBtn.textContent = originalText;
                    postBtn.disabled = false;
                } catch (err) {
                    alert('사진 업로드 실패: ' + err.message);
                    return;
                }
            }

            let existingPost = id ? posts.find(p => p.id == id) : null;
            let viewCount = existingPost ? (existingPost.views || 0) : 0;
            const dateStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '.');

            const postPayload = {
                title, content, category, img,
                author: existingPost ? existingPost.author : currentUser.nickname,
                date: existingPost ? existingPost.date : dateStr,
                views: viewCount
            };

            if (supabase) {
                if (id) {
                    const { error } = await supabase.from('posts').update(postPayload).eq('id', id);
                    if (error) alert('수정 실패: ' + error.message);
                } else {
                    const { error } = await supabase.from('posts').insert([postPayload]);
                    if (error) alert('발행 실패: ' + error.message);
                }
                await loadData();
            } else {
                if (id) {
                    const idx = posts.findIndex(p => p.id == id);
                    if (idx !== -1) posts[idx] = { ...posts[idx], ...postPayload };
                } else {
                    posts.unshift({ ...postPayload, id: Date.now() });
                }
            }
            // Clear draft on success
            SessionManager.clearDraft(SessionManager.KEYS.DRAFT_POST);
            closeModal();
            renderAll();
            listView.style.display = 'block';
            detailView.style.display = 'none';
        };

        // Draft Auto-save for Post
        form.oninput = () => {
            if (!document.getElementById('post-id').value) { // Only save drafts for NEW posts
                SessionManager.saveDraft(SessionManager.KEYS.DRAFT_POST, {
                    title: document.getElementById('post-title').value,
                    content: document.getElementById('post-content').value,
                    category: document.getElementById('post-category').value
                });
            }
        };
    }

    // Auth Form Submit
    if (authForm) {
        authForm.onsubmit = async (e) => {
            e.preventDefault();
            const u = document.getElementById('auth-username').value.trim();
            const p = document.getElementById('auth-password').value.trim();
            const n = document.getElementById('auth-nickname').value.trim();

            if (authMode === 'signup') {
                if (p.length < 8) return alert('비밀번호는 8자 이상이어야 합니다.');
                if (u === p) return alert('아이디와 비밀번호는 같을 수 없습니다.');
                if (users.find(user => user.username === u)) return alert('이미 존재하는 아이디입니다.');

                if (supabase) {
                    const country = document.getElementById('auth-country') ? document.getElementById('auth-country').value : '';
                    const language = document.getElementById('auth-lang') ? document.getElementById('auth-lang').value : LanguageManager.currentLang;

                    const { data, error } = await supabase.auth.signUp({
                        email: u,
                        password: p,
                        options: {
                            data: {
                                nickname: n,
                                country: country,
                                language: language,
                                consent_location: document.getElementById('auth-consent-location') ? document.getElementById('auth-consent-location').checked : false
                            }
                        }
                    });

                    if (error) {
                        alert('가입 실패: ' + error.message);
                        return;
                    }

                    // Set language immediately for the current session
                    LanguageManager.setLanguage(language);

                } else {
                    const locConsent = document.getElementById('auth-consent-location') ? document.getElementById('auth-consent-location').checked : false;
                    const newUser = { username: u, password: p, nickname: n || u, role: 'user', location_allowed: locConsent };
                    users.push(newUser);
                }
                alert('회원가입이 완료되었습니다. 로그인해 주세요.');
                SessionManager.clearDraft(SessionManager.KEYS.DRAFT_SIGNUP);
                await loadData();
                openAuthModal('login');
            } else {
                // Login Mode
                let user = null;
                if (supabase) {
                    const { data, error } = await supabase
                        .from('users')
                        .select('*')
                        .eq('username', u)
                        .eq('password', p)
                        .maybeSingle();

                    if (error) {
                        console.error('Login error:', error);
                    } else {
                        user = data;
                    }
                } else {
                    user = users.find(uObj => uObj.username === u && uObj.password === p);
                }

                if (user) {
                    currentUser = user;
                    SessionManager.saveAuth(user);
                    closeAuthModal();
                    checkSession();
                    renderAll();
                } else {
                    alert('아이디 또는 비밀번호가 틀렸습니다. (서버 연결 상태도 확인해 주세요.)');
                }
            }
        };

        // Draft Auto-save for Signup
        authForm.oninput = () => {
            if (authMode === 'signup') {
                SessionManager.saveDraft(SessionManager.KEYS.DRAFT_SIGNUP, {
                    username: document.getElementById('auth-username').value,
                    nickname: document.getElementById('auth-nickname').value,
                    country: document.getElementById('auth-country') ? document.getElementById('auth-country').value : '',
                    language: document.getElementById('auth-lang') ? document.getElementById('auth-lang').value : LanguageManager.currentLang
                });
            }
        };
    }



    const postImgBtn = document.getElementById('upload-post-img-btn');
    const postImgInput = document.getElementById('post-file-input');
    const postImgPreview = document.getElementById('post-img-preview');
    const postImgPreviewImg = postImgPreview ? postImgPreview.querySelector('img') : null;
    if (postImgBtn && postImgInput) {
        postImgBtn.onclick = () => postImgInput.click();
        postImgInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file && postImgPreview && postImgPreviewImg) {
                const reader = new FileReader();
                reader.onload = (re) => {
                    postImgPreviewImg.src = re.target.result;
                    postImgPreview.style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        };
    }

    // [NEW] Modal & Navigation Listeners
    if (newPostBtn) newPostBtn.onclick = () => openModal();
    if (closeBtn) closeBtn.onclick = () => closeModal();
    if (backBtn) backBtn.onclick = () => {
        detailView.style.display = 'none';
        listView.style.display = 'block';
        window.scrollTo({ top: 400, behavior: 'smooth' });
    };

    // Category Management
    if (manageCatsBtn) manageCatsBtn.onclick = () => {
        if (catMgrSection) {
            catMgrSection.style.display = catMgrSection.style.display === 'none' ? 'block' : 'none';
            renderCatManager();
        }
    };
    if (addCatBtn) addCatBtn.onclick = () => {
        const name = newCatInput ? newCatInput.value.trim() : '';
        if (name) {
            const newId = 'cat_' + Date.now();
            categories.push({ id: newId, name: name });
            if (newCatInput) newCatInput.value = '';
            renderAll();
        }
    };

    // Account Form Submit
    if (accountForm) {
        accountForm.onsubmit = async (e) => {
            e.preventDefault();
            if (!currentUser) return;

            const nick = document.getElementById('acc-nickname').value.trim();
            const pass = document.getElementById('acc-password').value.trim();
            const lang = document.getElementById('settings-lang-select') ? document.getElementById('settings-lang-select').value : LanguageManager.currentLang;

            const updateData = {
                nickname: nick,
                password: pass
            };

            if (supabase) {
                // Update user metadata for language
                const { data: userUpdateData, error: userUpdateError } = await supabase.auth.updateUser({
                    data: { language: lang }
                });
                if (userUpdateError) {
                    console.error('Failed to update user metadata:', userUpdateError);
                    alert('언어 설정 업데이트 실패: ' + userUpdateError.message);
                } else {
                    LanguageManager.setLanguage(lang); // Update client-side language immediately
                }

                const { error } = await supabase.from('users').update(updateData).eq('username', currentUser.username);
                if (error) {
                    alert('정보 수정 실패: ' + error.message);
                    return;
                }
            } else {
                // Local fallback
                const idx = users.findIndex(u => u.username === currentUser.username);
                if (idx !== -1) users[idx] = { ...users[idx], ...updateData };
            }

            // Update Current State
            currentUser = { ...currentUser, ...updateData };
            SessionManager.saveAuth(currentUser);
            alert('회원 정보가 수정되었습니다.');
            closeAccountModal();
            updateUserNav();
            renderAll();
        };
    }
}

// Finalized setupEventListeners.

function openModal(post = null) {
    modal.classList.add('active');
    catMgrSection.style.display = 'none';
    if (post) {
        document.getElementById('modal-title').textContent = '글 수정하기';
        document.getElementById('post-id').value = post.id;
        document.getElementById('post-category').value = post.category;
        document.getElementById('post-title').value = post.title;
        document.getElementById('post-img').value = post.img || '';
        document.getElementById('post-content').value = post.content;
    } else {
        document.getElementById('modal-title').textContent = '새로운 글 작성';
        form.reset(); document.getElementById('post-id').value = '';
    }
}
function closeModal() { modal.classList.remove('active'); }
function renderCatManager() {
    if (!catMgrList) return;
    catMgrList.innerHTML = '';
    categories.forEach(cat => {
        const li = document.createElement('li'); li.className = 'cat-mgr-item';
        li.innerHTML = `<span>${cat.name}</span><button onclick="deleteCategory('${cat.id}')" class="cat-del-btn">✕</button>`;
        catMgrList.appendChild(li);
    });
}
window.deleteCategory = (id) => { if (confirm('삭제하시겠습니까?')) { categories = categories.filter(c => c.id !== id); renderAll(); } };

// Post Actions
window.editPostAction = (id) => {
    const post = posts.find(p => p.id == id);
    if (post) openModal(post);
};

// Social Links Management
async function addSocialLink() {
    const name = document.getElementById('new-link-name').value.trim();
    const url = document.getElementById('new-link-url').value.trim();
    if (!name || !url) return alert('이름과 주소를 모두 입력해주세요.');

    if (supabase) {
        const { error } = await supabase.from('social_links').insert([{ name, url }]);
        if (error) alert('추가 실패: ' + error.message);
    } else {
        socialLinks.push({ id: Date.now(), name, url });
    }
    document.getElementById('new-link-name').value = '';
    document.getElementById('new-link-url').value = '';
    await loadData();
    renderAll();
}
window.addSocialLink = addSocialLink;

async function removeSocialLink(id) {
    if (confirm('링크를 삭제하시겠습니까?')) {
        if (supabase) {
            const { error } = await supabase.from('social_links').delete().eq('id', id);
            if (error) alert('삭제 실패: ' + error.message);
        } else {
            socialLinks = socialLinks.filter(l => l.id != id);
        }
        await loadData();
        renderAll();
    }
}

function renderSocialLinks() {
    const list = document.getElementById('social-links-list');
    const mgrList = document.getElementById('social-mgr-list');
    if (list) {
        list.innerHTML = '';
        socialLinks.forEach(link => {
            list.innerHTML += `<a href="${link.url}" target="_blank" class="social-link">${link.name}</a>`;
        });
    }

    if (mgrList) {
        mgrList.innerHTML = '';
        if (socialLinks.length === 0) {
            mgrList.innerHTML = '<li style="opacity:0.5; font-size:0.6rem;">등록된 커스텀 링크가 없습니다.</li>';
        } else {
            socialLinks.forEach(link => {
                const li = document.createElement('li');
                li.className = 'social-mgr-item';
                li.innerHTML = `
                    <span>${link.name}</span>
                    <button onclick="removeSocialLink('${link.id}')" class="cat-del-btn">✕</button>
                `;
                mgrList.appendChild(li);
            });
        }
    }
}

window.deletePostAction = async (id) => {
    if (confirm('정말 삭제하시겠습니까?')) {
        if (supabase) {
            const { error } = await supabase.from('posts').delete().eq('id', id);
            if (error) alert('삭제 실패: ' + error.message);
        } else {
            posts = posts.filter(p => p.id != id);
        }
        await loadData();
        renderAll();
    }
};

// User Management Actions
window.updateUserRole = async (username, newRole) => {
    if (supabase) {
        const { error } = await supabase.from('users').update({ role: newRole }).eq('username', username);
        if (error) alert('권한 변경 실패: ' + error.message);
        else alert('권한이 변경되었습니다.');
    } else {
        const user = users.find(u => u.username === username);
        if (user) user.role = newRole;
    }
    await loadData();
    renderUserManagement();
};

window.deleteUser = async (username) => {
    if (confirm(`${username} 사용자를 삭제하시겠습니까?`)) {
        if (supabase) {
            const { error } = await supabase.from('users').delete().eq('username', username);
            if (error) alert('삭제 실패: ' + error.message);
        } else {
            users = users.filter(u => u.username !== username);
        }
        await loadData();
        renderUserManagement();
    }
};

// Account management
window.openAccountModal = () => {
    if (!currentUser) return;
    accountModal.classList.add('active');
    document.getElementById('acc-nickname').value = currentUser.nickname || '';
    document.getElementById('acc-username').value = currentUser.username || '';
    // For Google/OAuth users, password might be empty/null
    document.getElementById('acc-password').value = currentUser.password || '';

    // [NEW] If OAuth user, disable password edit or show indicator?
    // Let's keep it editable if they want to set a local password, 
    // but handle the display gracefully.


    // [NEW] Reset activity section (Slide hide)
    const activitySection = document.getElementById('account-activity-section');
    const chevron = document.getElementById('activity-chevron');
    if (activitySection) {
        activitySection.style.display = 'none';
        activitySection.style.maxHeight = '0';
    }
    if (chevron) chevron.textContent = '▾';

    // Initial activity render (Reset page)
    activityPage = 1;
    renderUserActivity();
};

window.toggleAccountActivity = () => {
    const section = document.getElementById('account-activity-section');
    const chevron = document.getElementById('activity-chevron');
    if (!section) return;

    if (section.style.display === 'none') {
        section.style.display = 'block';
        section.style.maxHeight = '1000px'; // Allow expansion
        if (chevron) chevron.textContent = '▴';
        renderUserActivity(); // Ensure fresh render
    } else {
        section.style.maxHeight = '0';
        setTimeout(() => { if (section.style.maxHeight === '0px') section.style.display = 'none'; }, 300);
        if (chevron) chevron.textContent = '▾';
    }
};

window.closeAccountModal = () => accountModal.classList.remove('active');



// ==========================================
// 12. ORACLE HELP CHATBOT
// ==========================================
let isChatOpen = false;

function toggleChat() {
    const chatWindow = document.getElementById('chatbot-window');
    const chatInput = document.getElementById('chat-input');
    if (chatWindow) {
        isChatOpen = !isChatOpen;
        chatWindow.style.display = isChatOpen ? 'flex' : 'none';
        if (isChatOpen && chatInput) chatInput.focus();
    }
}

function initChatbot() {
    const chatBtn = document.getElementById('chat-toggle-btn');
    const chatWindow = document.getElementById('chatbot-window');
    const chatInput = document.getElementById('chat-input');
    const chatClose = document.getElementById('close-chat');

    if (chatBtn) {
        chatBtn.onclick = toggleChat;
    }

    if (chatClose) {
        chatClose.onclick = () => {
            isChatOpen = false;
            chatWindow.style.display = 'none';
        };
    }

    if (chatInput) {
        chatInput.onkeypress = async (e) => {
            if (e.key === 'Enter' && chatInput.value.trim()) {
                const query = chatInput.value.trim();
                chatInput.value = '';
                await handleChatQuery(query);
            }
        };
    }
}

async function handleChatQuery(query) {
    const chatBody = document.getElementById('chat-body');
    if (!chatBody) return;

    // User Message
    const userMsg = document.createElement('div');
    userMsg.className = 'chat-msg user-msg';
    userMsg.textContent = query;
    chatBody.appendChild(userMsg);
    chatBody.scrollTop = chatBody.scrollHeight;

    // Bot Thinking
    const botMsg = document.createElement('div');
    botMsg.className = 'chat-msg bot-msg';
    botMsg.textContent = '...Analyzing...';
    chatBody.appendChild(botMsg);

    // Get Response & Log
    const aiResponse = await getHelpResponse(query);

    setTimeout(async () => {
        // Clear analyzing message and add rich response
        botMsg.innerHTML = generateRichChatHtml(aiResponse);
        chatBody.scrollTop = chatBody.scrollHeight;

        // Log query
        const plainTextResponse = typeof aiResponse === 'string' ? aiResponse : (aiResponse.text || 'Rich Content');
        await logChatQuery(query, plainTextResponse);
    }, 800);
}

function generateRichChatHtml(response) {
    if (typeof response === 'string') return response;

    let html = `<div>${response.text}</div>`;
    if (response.image) {
        html += `<img src="${response.image}" class="chat-thumb" style="width:100%; border-radius:10px; margin-top:10px; border:1px solid var(--futuristic-border);">`;
    }
    if (response.link) {
        html += `<button onclick="${response.link.action}" class="sm-btn" style="width:100%; margin-top:10px;">글 보러가기</button>`;
    }
    return html;
}

async function getHelpResponse(query) {
    const q = query.toLowerCase();
    if (q.includes('글') || q.includes('작성') || q.includes('포스트')) return "글을 쓰려면 상단 'FEEDS' 섹션의 '글쓰기' 버튼을 누르세요. (현재 어드민 권한이 필요합니다.)";
    if (q.includes('로그인') || q.includes('접속')) return "우측 상단 'ACCESS' 버튼을 눌러 로그인하거나 회원가입할 수 있습니다.";
    if (q.includes('삭제') || q.includes('수정')) return "자신이 쓴 글 상단의 ⋮ 아이콘을 눌러 수정 또는 삭제가 가능합니다.";
    if (q.includes('로또') || q.includes('예측')) return "CONNECT 섹션 아래의 'LOTTO ORACLE' 메뉴를 이용해 보세요.";
    if (q.includes('도움') || q.includes('기능')) return "저는 블로그 콘텐츠와 이미지, 태그를 분석하는 Oracle AI입니다. 질문을 주시면 관련 내용을 찾아드릴게요.";
    return await oracleBrain(query);
}

// 🧠 Advanced AI Logic: Oracle Brain (Delegated to Logic Thread)
async function oracleBrain(query) {
    const q = (query || '').toLowerCase();

    // Side effect tracking (keep on main thread for DOM/Storage consistency)
    if (q.startsWith('#')) {
        const tag = q.replace('#', '');
        updateUserIntel({ last_searched_tag: tag });
    }

    // Heavy computation offloaded to worker (with fallback)
    let response = null;
    try {
        response = await LogicWorker.execute('ORACLE_BRAIN', { query, posts });
    } catch (e) {
        console.warn('LogicWorker fallback in oracleBrain:', e);
        return "그 질문의 맥락을 분석 중입니다. 아직 블로그에서 관련 포스트를 찾지 못했지만, 기록을 남겨 곧 학습하도록 하겠습니다.";
    }

    if (response && response.link && response.link.id) {
        updateUserIntel({ last_recommended_post: response.link.id });
    }

    return response;
}

// 📊 User Intelligence: Behavior Tracking
async function updateUserIntel(data) {
    if (!currentUser) return;

    const intelData = {
        username: currentUser.username,
        updated_at: new Date().toISOString(),
        ...data
    };

    console.log('[AI INTEL UPDATE]', intelData);

    if (supabase) {
        try {
            // Upsert: Create or Update user intel
            const { error } = await supabase
                .from('user_intel')
                .upsert([intelData], { onConflict: 'username' });
            if (error) console.warn('User Intel save failed:', error.message);
        } catch (e) {
            console.warn('User Intel Error:', e);
        }
    } else {
        // Local Fallback
        const localIntel = JSON.parse(localStorage.getItem('AI_USER_INTEL') || '{}');
        localStorage.setItem('AI_USER_INTEL', JSON.stringify({ ...localIntel, ...intelData }));
    }
}

async function logChatQuery(query, response) {
    const logData = {
        query: query,
        response: response,
        user_id: currentUser ? currentUser.username : 'anonymous',
        session_id: sessionStorage.getItem('SESSION_ID') || 'guest-' + Date.now(),
        category: 'help'
    };

    console.log('[CHAT LOG]', logData);

    if (supabase) {
        try {
            const { error } = await supabase.from('chatbot_logs').insert([logData]);
            if (error) console.warn('Chat log save failed (Supabase):', error.message);
        } catch (e) {
            console.warn('Chat log save error:', e);
        }
    } else {
        const localLogs = JSON.parse(localStorage.getItem('CHATBOT_LOCAL_LOGS') || '[]');
        localLogs.push({ ...logData, created_at: new Date().toISOString() });
        localStorage.setItem('CHATBOT_LOCAL_LOGS', JSON.stringify(localLogs.slice(-100)));
    }
}

// Oracle Insights Logic
async function toggleOracleInsights() {
    const view = document.getElementById('oracle-insights-view');
    const list = document.getElementById('insights-list');
    if (!view || !list) return;

    if (view.style.display === 'none') {
        view.style.display = 'block';
        list.innerHTML = '<li style="color:var(--futuristic-accent); font-size:0.6rem;">로딩 중...</li>';

        let logs = [];
        if (supabase) {
            try {
                const { data, error } = await supabase.from('chatbot_logs').select('*').order('created_at', { ascending: false }).limit(50);
                if (!error) logs = data;
                else console.warn('Fetch logs error:', error.message);
            } catch (e) {
                console.warn('Fetch logs exception:', e);
            }
        } else {
            logs = JSON.parse(localStorage.getItem('CHATBOT_LOCAL_LOGS') || '[]');
        }

        list.innerHTML = '';
        if (logs.length === 0) {
            list.innerHTML = '<li style="opacity:0.5; font-size:0.6rem;">기록된 로그가 없습니다.</li>';
        } else {
            logs.forEach(log => {
                const li = document.createElement('li');
                li.style.marginBottom = '10px';
                li.style.borderBottom = '1px solid var(--futuristic-border)';
                li.style.paddingBottom = '5px';
                li.innerHTML = `
                    <div style="color:var(--futuristic-accent); font-weight:bold;">Q: ${log.query}</div>
                    <div style="color:var(--futuristic-muted);">A: ${log.response}</div>
                    <div style="font-size:0.5rem; opacity:0.5;">${new Date(log.created_at || Date.now()).toLocaleString()} | ${log.user_id}</div>
                `;
                list.appendChild(li);
            });
        }
    } else {
        view.style.display = 'none';
    }
}

// ==========================================
// 13. COMMENT SYSTEM
// ==========================================
function initEmoticonPicker() {
    if (!emojiPicker) return;
    emojiPicker.innerHTML = emoticons.map(e => `<span class="emoticon-item" onclick="addEmoji('${e}')">${e}</span>`).join('');
}

window.addEmoji = (emoji) => {
    if (commentInput) commentInput.value += emoji;
}

async function loadComments(postId) {
    activePostId = postId;
    if (supabase) {
        const { data, error } = await supabase.from('comments').select('*').eq('post_id', postId).order('created_at', { ascending: true });
        if (!error) comments = data || [];
        else console.error('Comment fetch error:', error.message);
    } else {
        const local = JSON.parse(localStorage.getItem('LOCAL_COMMENTS') || '[]');
        comments = local.filter(c => c.post_id == postId);
    }
    renderComments();
}

function renderComments() {
    if (!commentList) return;

    // O(N) Optimization: Pre-map children by parent_id
    const childMap = new Map();
    const roots = [];

    comments.forEach(c => {
        if (!c.parent_id) {
            roots.push(c);
        } else {
            if (!childMap.has(c.parent_id)) childMap.set(c.parent_id, []);
            childMap.get(c.parent_id).push(c);
        }
    });

    if (roots.length === 0) {
        commentList.innerHTML = '<p style="text-align:center; opacity:0.5; padding:20px;">첫 댓글을 남겨보세요!</p>';
    } else {
        // Render using the map for efficient lookups
        commentList.innerHTML = roots.map(c => renderCommentItem(c, childMap)).join('');
    }

    const formArea = document.getElementById('comment-form-area');
    const loginMsg = document.getElementById('comment-login-msg');
    if (formArea && loginMsg) {
        formArea.style.display = currentUser ? 'block' : 'none';
        loginMsg.style.display = currentUser ? 'none' : 'block';
    }
}

function renderCommentItem(c, childMap, depth = 0) {
    const isOwner = currentUser && (currentUser.username === c.user_id);
    const myChildren = childMap.get(c.id) || [];

    return `
        <div class="comment-item" style="margin-left: calc(var(--comment-indent) * ${depth}); ${depth > 0 ? 'border-left: 2px solid var(--futuristic-accent);' : ''}">
            <div class="comment-meta">
                <div>
                    <span class="comment-nickname">${c.nickname}</span>
                    ${depth > 0 ? '<span class="reply-tag">REPLY</span>' : ''}
                </div>
                <span class="comment-date">${new Date(c.created_at || Date.now()).toLocaleString()}</span>
            </div>
            <div class="comment-content">${c.content.replace(/\n/g, '<br>')}</div>
            <div class="comment-actions">
                <button onclick="handleReaction(${c.id}, 'like')" class="reaction-btn">👍 ${c.likes || 0}</button>
                <button onclick="handleReaction(${c.id}, 'dislike')" class="reaction-btn">👎 ${c.dislikes || 0}</button>
                <button onclick="openReplyForm(${c.id})">답글 달기</button>
                ${isOwner ? `
                    <button onclick="requestEditComment(${c.id}, '${c.content.replace(/'/g, "\\'")}')">수정</button>
                    <button onclick="deleteComment(${c.id})" class="delete-btn">삭제</button>
                ` : ''}
            </div>
            <div id="reply-form-${c.id}" class="reply-form-container" style="display:none; margin-top:10px;">
                <textarea id="reply-input-${c.id}" placeholder="답글을 입력하세요..." class="reply-textarea"></textarea>
                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:5px;">
                    <button class="action-btn-sm" onclick="closeReplyForm(${c.id})">취소</button>
                    <button class="action-btn-sm primary" onclick="submitComment(${c.id})">등록</button>
                </div>
            </div>
            ${myChildren.map(child => renderCommentItem(child, childMap, depth + 1)).join('')}
        </div>
    `;
}

window.openReplyForm = (id) => {
    const el = document.getElementById(`reply-form-${id}`);
    if (el) el.style.display = 'block';
};

window.closeReplyForm = (id) => {
    const el = document.getElementById(`reply-form-${id}`);
    if (el) el.style.display = 'none';
};

async function submitComment(arg = null) {
    if (!currentUser) return alert('로그인이 필요합니다.');

    let content = '';
    // Normalize pid: ignore if it's an event object, handle number or string IDs
    let pid = (arg && (typeof arg === 'number' || typeof arg === 'string')) ? arg : null;

    if (pid) {
        const replyInput = document.getElementById(`reply-input-${pid}`);
        if (replyInput) content = replyInput.value.trim();
    } else {
        if (commentInput) content = commentInput.value.trim();
    }

    if (!content) return alert('내용을 입력해주세요.');

    const payload = {
        post_id: activePostId,
        user_id: currentUser.username,
        nickname: currentUser.nickname,
        content: content,
        parent_id: pid
    };

    if (supabase) {
        const { error } = await supabase.from('comments').insert([payload]);
        if (error) return alert('저장 실패: ' + error.message);
    } else {
        const local = JSON.parse(localStorage.getItem('LOCAL_COMMENTS') || '[]');
        local.push({ ...payload, id: Date.now(), created_at: new Date().toISOString(), likes: 0, dislikes: 0 });
        localStorage.setItem('LOCAL_COMMENTS', JSON.stringify(local));
    }

    if (pid) {
        const replyInput = document.getElementById(`reply-input-${pid}`);
        if (replyInput) replyInput.value = '';
        closeReplyForm(pid);
    } else {
        if (commentInput) commentInput.value = '';
    }

    await loadComments(activePostId);
}

async function handleReaction(id, type) {
    if (!currentUser) return alert('로그인이 필요합니다.');

    const comment = comments.find(c => c.id == id);
    if (!comment) return;

    const column = type === 'like' ? 'likes' : 'dislikes';
    const newVal = (comment[column] || 0) + 1;

    if (supabase) {
        const { error } = await supabase.from('comments').update({ [column]: newVal }).eq('id', id);
        if (error) return alert('실패: ' + error.message);
    } else {
        const local = JSON.parse(localStorage.getItem('LOCAL_COMMENTS') || '[]');
        const idx = local.findIndex(c => c.id == id);
        if (idx !== -1) local[idx][column] = (local[idx][column] || 0) + 1;
        localStorage.setItem('LOCAL_COMMENTS', JSON.stringify(local));
    }

    await loadComments(activePostId);
}

window.requestEditComment = (id, oldContent) => {
    const newContent = prompt('수정할 내용을 입력하세요:', oldContent);
    if (newContent && newContent !== oldContent) {
        editComment(id, newContent);
    }
}

async function editComment(id, content) {
    const comment = comments.find(c => c.id == id);
    if (!comment || !currentUser || comment.user_id !== currentUser.username) {
        return alert('본인의 댓글만 수정할 수 있습니다.');
    }

    if (supabase) {
        const { error } = await supabase.from('comments').update({ content }).eq('id', id);
        if (error) return alert('수정 실패: ' + error.message);
    } else {
        const local = JSON.parse(localStorage.getItem('LOCAL_COMMENTS') || '[]');
        const idx = local.findIndex(c => c.id == id);
        if (idx !== -1) local[idx].content = content;
        localStorage.setItem('LOCAL_COMMENTS', JSON.stringify(local));
    }
    await loadComments(activePostId);
}

async function deleteComment(id) {
    const comment = comments.find(c => c.id == id);
    if (!comment || !currentUser || comment.user_id !== currentUser.username) {
        return alert('본인의 댓글만 삭제할 수 있습니다.');
    }

    if (!confirm('댓글을 삭제하시겠습니까?')) return;
    if (supabase) {
        const { error } = await supabase.from('comments').delete().eq('id', id);
        if (error) return alert('삭제 실패: ' + error.message);
    } else {
        const local = JSON.parse(localStorage.getItem('LOCAL_COMMENTS') || '[]');
        const filtered = local.filter(c => c.id != id);
        localStorage.setItem('LOCAL_COMMENTS', JSON.stringify(filtered));
    }
    await loadComments(activePostId);
}

// ==========================================
// 14. ACCOUNT ACTIVITY
// ==========================================
var activityPage = 1;
const activityPerPage = 3;

function setupActivityTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(t => {
        t.onclick = () => {
            tabs.forEach(item => item.classList.remove('active'));
            t.classList.add('active');
            currentTab = t.dataset.tab;
            activityPage = 1; // Reset to page 1
            renderUserActivity();
        };
    });
}

async function renderUserActivity() {
    if (!currentUser || !activityContent) return;
    const paginationEl = document.getElementById('activity-pagination');

    let rawItems = [];
    if (currentTab === 'my-posts') {
        rawItems = posts.filter(p => p.author === currentUser.nickname);
    } else {
        let allComments = [];
        if (supabase) {
            const { data } = await supabase.from('comments').select('*').eq('user_id', currentUser.username);
            allComments = data || [];
        } else {
            allComments = JSON.parse(localStorage.getItem('LOCAL_COMMENTS') || '[]').filter(c => c.user_id === currentUser.username);
        }
        const commentedPostIds = [...new Set(allComments.map(c => c.post_id))];
        rawItems = posts.filter(p => commentedPostIds.includes(p.id));
    }

    // Pagination Logic
    const totalPages = Math.ceil(rawItems.length / activityPerPage);
    const start = (activityPage - 1) * activityPerPage;
    const items = rawItems.slice(start, start + activityPerPage);

    // Render Content
    if (items.length === 0) {
        activityContent.innerHTML = `<p style="padding:20px; text-align:center; opacity:0.3;">${currentTab === 'my-posts' ? '작성한 글이 없습니다.' : '댓글을 단 글이 없습니다.'}</p>`;
    } else {
        activityContent.innerHTML = items.map(p => `
            <div class="activity-item" onclick="closeAccountModal(); showDetail(${p.id});" style="margin-bottom: 10px; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); cursor: pointer; transition: background 0.2s;">
                <h4 style="font-size: 0.85rem; margin-bottom: 5px; color: var(--futuristic-accent);">${p.title}</h4>
                <p style="font-size: 0.7rem; opacity: 0.6;">${p.date} | ${currentTab === 'my-posts' ? '조회 ' + (p.views || 0) : '댓글 작성'}</p>
            </div>
        `).join('');
    }

    // Render Pagination Controls
    if (paginationEl) {
        if (totalPages > 1) {
            paginationEl.innerHTML = `
                <button onclick="changeActivityPage(-1)" class="sm-btn" ${activityPage === 1 ? 'disabled style="opacity:0.3;"' : ''}>PREV</button>
                <span style="font-size: 0.7rem; align-self: center; opacity: 0.8;">${activityPage} / ${totalPages}</span>
                <button onclick="changeActivityPage(1)" class="sm-btn" ${activityPage === totalPages ? 'disabled style="opacity:0.3;"' : ''}>NEXT</button>
            `;
        } else {
            paginationEl.innerHTML = '';
        }
    }
}

window.changeActivityPage = (dir) => {
    activityPage += dir;
    renderUserActivity();
};

// Final Export: Attach to window for inline HTML onclick/onchange handlers
if (typeof window !== 'undefined') {
    Object.assign(window, {
        renderAll,
        showDetail,
        updateUserIntel,
        openAccountModal,
        closeAccountModal,
        logout,
        openAuthModal,
        closeAuthModal,
        toggleAuthMode,
        openRecoveryModal,
        closeRecoveryModal,
        clearNotifications: window.clearNotifications || function () { NotificationManager.count = 0; NotificationManager.updateBadge(); }, // Safe fallback
        toggleNotifSound: window.toggleNotifSound || function () { NotificationManager.isSoundOn = !NotificationManager.isSoundOn; localStorage.setItem('nano_notif_sound', NotificationManager.isSoundOn ? 'on' : 'off'); NotificationManager.updateButtons(); },
        addSocialLink: window.addSocialLink || function () { /* assume defined above or add it if missing */ },
        toggleOracleInsights: window.toggleOracleInsights || function () {
            const view = document.getElementById('oracle-insights-view');
            if (view) view.style.display = view.style.display === 'none' ? 'block' : 'none';
        },
        editPostAction: window.editPostAction || function (id) { openModal(posts.find(p => p.id == id)); },
        deletePostAction: window.deletePostAction || async function (id) { if (confirm('삭제하시겠습니까?')) { if (supabase) await supabase.from('posts').delete().eq('id', id); else posts = posts.filter(p => p.id != id); await loadData(); renderAll(); } },
        handleReaction,
        openReplyForm,
        closeReplyForm,
        submitComment,
        requestEditComment,
        editComment,
        deleteComment,
        updateUserRole: window.updateUserRole || async function (uid, role) { if (supabase) { const { error } = await supabase.from('users').update({ role }).eq('username', uid); if (error) alert(error.message); else alert('권한이 변경되었습니다.'); await loadData(); renderUserManagement(); } },
        deleteUser: window.deleteUser || async function (uid) { if (confirm('사용자를 삭제하시겠습니까?')) { if (supabase) { const { error } = await supabase.from('users').delete().eq('username', uid); if (error) alert(error.message); else { alert('삭제되었습니다.'); await loadData(); renderUserManagement(); } } } },
        renderUserManagement,
        openMaintenanceModal: () => {
            const modal = document.getElementById('maintenance-modal');
            if (modal) {
                // Pre-fill with current state if possible
                modal.style.display = 'flex';
            }
        },
        closeMaintenanceModal: () => {
            const modal = document.getElementById('maintenance-modal');
            if (modal) modal.style.display = 'none';
        },
        toggleMaintenance: async (status) => {
            const msg = document.getElementById('mt-message')?.value || '서버 점검 중입니다.';
            const sch = document.getElementById('mt-schedule')?.value || '';

            if (supabase) {
                const { error } = await supabase.from('site_management').update({
                    is_maintenance: status,
                    maintenance_message: msg,
                    maintenance_schedule: sch,
                    updated_at: new Date().toISOString()
                }).eq('id', 1);

                if (error) alert('Error: ' + error.message);
                else {
                    alert(status ? '서버 점검이 시작되었습니다.' : '서버 점검이 종료되었습니다.');
                    location.reload();
                }
            } else {
                alert('Supabase not initialized');
            }
        }
    });
}

// Maintenance Sync Logic
async function syncMaintenanceStatus() {
    if (!supabase) return;

    // Initial Load
    const { data, error } = await supabase.from('site_management').select('*').eq('id', 1).single();
    if (!error && data) {
        applyMaintenanceUI(data);
    }

    // Realtime Subscription
    supabase.channel('site_mgmt_changes')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'site_management' }, payload => {
            applyMaintenanceUI(payload.new);
        })
        .subscribe();
}

function applyMaintenanceUI(data) {
    const overlay = document.getElementById('maintenance-overlay');
    const msgEl = document.getElementById('mt-display-message');
    const schEl = document.getElementById('mt-display-schedule');
    const ctrlEl = document.getElementById('admin-mt-control');

    if (data.is_maintenance) {
        // Check if current user is admin to allow bypass
        const isAdmin = currentUser && currentUser.role === 'admin';

        if (msgEl) msgEl.innerText = data.maintenance_message;
        if (schEl) schEl.innerText = data.maintenance_schedule;
        if (overlay) overlay.style.display = 'flex';

        // Show restore button for admins on the overlay
        if (ctrlEl) ctrlEl.style.display = isAdmin ? 'block' : 'none';

        // Disable scrolls and interactions if NOT admin
        if (!isAdmin) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'auto';
        }
    } else {
        if (overlay) overlay.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

// Add to init
const originalInit = init;
init = async function () {
    await originalInit();
    syncMaintenanceStatus();

    // Check for mobile login enforcement
    if (window.innerWidth <= 1024 && !currentUser) {
        setTimeout(() => {
            if (!currentUser) openAuthModal();
        }, 1500);
    }
};

init();

// Mobile UI Sync Logic
function syncMobileUI() {
    const welcomeName = document.getElementById('mobile-welcome-name');
    if (welcomeName) {
        welcomeName.innerText = currentUser ? (currentUser.nickname || currentUser.username) : 'User';
    }
}

// Intercept renderAll to sync mobile UI
const originalRenderAll = typeof renderAll !== 'undefined' ? renderAll : null;
if (originalRenderAll) {
    renderAll = async function () {
        await originalRenderAll();
        syncMobileUI();
    };
} else {
    // If renderAll not defined yet, poll for it or add to window
    window.addEventListener('load', () => {
        if (typeof renderAll !== 'undefined') {
            const innerRender = renderAll;
            renderAll = async function () {
                await innerRender();
                syncMobileUI();
            };
        }
    });
}
// ==========================================
// 11. MOBILE FUNCTIONAL FEATURES [NEW]
// ==========================================
window.mobileSearchKeyword = '';

function toggleMobileSearch() {
    const bar = document.getElementById('mobile-search-bar');
    if (!bar) return;
    const isVisible = bar.style.display !== 'none';
    bar.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) {
        document.getElementById('mobile-search-input').focus();
    } else {
        window.mobileSearchKeyword = '';
        document.getElementById('mobile-search-input').value = '';
        renderPosts();
    }
}

async function handleMobileSearch(val) {
    if (!val) {
        window.mobileSearchKeyword = '';
        renderPosts();
        return;
    }

    // [NEW] Translate search keyword to Korean if in other language
    if (LanguageManager.currentLang !== 'ko') {
        try {
            const res = await LogicWorker.execute('TRANSLATE', { text: val, targetLang: 'ko' });
            if (res && res.translatedText) {
                console.log('Search keyword translated to KO:', res.translatedText);
                window.mobileSearchKeyword = res.translatedText;
            } else {
                window.mobileSearchKeyword = val;
            }
        } catch (e) {
            console.warn('Search translation failed', e);
            window.mobileSearchKeyword = val;
        }
    } else {
        window.mobileSearchKeyword = val;
    }
    renderPosts();
}

function clearNotifications() {
    if (window.NotificationManager) {
        window.NotificationManager.count = 0;
        window.NotificationManager.updateBadge();
    }
}

function handleMobileNotifClick() {
    if (!currentUser) {
        alert("로그인 후 이용 할 수 있습니다.");
        openAuthModal();
        return;
    }
    if (NotificationManager.count === 0) {
        alert("현재 온 알람이 없습니다.");
    } else {
        clearNotifications();
    }
}

function exitApp() {
    console.log('Exiting app to main OS...');
    window.location.href = 'https://victoryka-os.pages.dev/';
}

function handleMobileChat() {
    if (!currentUser) {
        alert("로그인 후 이용 할 수 있습니다.");
        openAuthModal();
        return;
    }
    location.href = 'anticode.html';
}

function checkAuthGating() {
    if (!currentUser) {
        alert("로그인 후 이용 할 수 있습니다.");
        openAuthModal();
        return false;
    }
    return true;
}

// Mobile Settings
function openMobileSettings() {
    if (!checkAuthGating()) return;
    const overlay = document.getElementById('mobile-settings-overlay');
    if (overlay) overlay.style.display = 'flex';

    // 1. Sync current toggle state
    const btn = document.getElementById('mobile-notif-toggle');
    if (btn) btn.textContent = (NotificationManager.isSoundOn) ? 'ON' : 'OFF';

    // 2. Sync Layout Sliders with current CSS variables
    const style = getComputedStyle(document.documentElement);
    const widthRaw = style.getPropertyValue('--mobile-layout-scale').trim() || '100%';
    const heightRaw = style.getPropertyValue('--mobile-layout-height').trim() || '100%';

    const widthVal = parseInt(widthRaw) || 100;
    const heightVal = parseInt(heightRaw) || 100;

    const wSlider = document.querySelector('input[oninput="changeLayoutScale(this.value)"]');
    const hSlider = document.querySelector('input[oninput="changeHeightScale(this.value)"]');

    if (wSlider) wSlider.value = widthVal;
    if (hSlider) hSlider.value = heightVal;

    // 3. Conditional Account Section
    const accountGroup = document.getElementById('mobile-account-group');
    const userNameEl = document.getElementById('mobile-user-name');
    if (accountGroup) {
        if (currentUser) {
            accountGroup.style.display = 'block';
            if (userNameEl) userNameEl.textContent = currentUser.nickname || currentUser.username;
        } else {
            accountGroup.style.display = 'none';
        }
    }
}

function closeMobileSettings() {
    const overlay = document.getElementById('mobile-settings-overlay');
    if (overlay) overlay.style.display = 'none';
}

function changeFontSize(scale) {
    document.documentElement.style.setProperty('--mobile-font-scale', scale);
    document.querySelectorAll('.font-size-controls button').forEach(b => b.classList.remove('active'));
    // Use scale or target to add active class
    // Since this is called from inline onclick, event is global
    if (window.event && window.event.currentTarget) {
        window.event.currentTarget.classList.add('active');
    }
    SessionManager.saveUIState({ fontScale: scale });
}

function changeLayoutScale(percentage) {
    document.documentElement.style.setProperty('--mobile-layout-scale', percentage + '%');
    SessionManager.saveUIState({ layoutScale: percentage });
}

function changeHeightScale(percentage) {
    document.documentElement.style.setProperty('--mobile-layout-height', percentage + '%');
    SessionManager.saveUIState({ layoutHeight: percentage });
}

// Expose globals
window.toggleMobileSearch = () => checkAuthGating() && toggleMobileSearchActual();
window.handleMobileSearch = handleMobileSearch;
window.handleMobileNotifClick = handleMobileNotifClick;
window.clearNotifications = clearNotifications;
window.exitApp = exitApp;
window.handleMobileChat = handleMobileChat;
window.openMobileSettings = openMobileSettings;
window.closeMobileSettings = closeMobileSettings;
window.changeFontSize = changeFontSize;
window.changeLayoutScale = changeLayoutScale;
window.changeHeightScale = changeHeightScale;



function toggleMobileSearchActual() {
    const bar = document.getElementById('mobile-search-bar');
    if (!bar) return;
    const isVisible = bar.style.display !== 'none';
    bar.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) {
        document.getElementById('mobile-search-input').focus();
    } else {
        window.mobileSearchKeyword = '';
        document.getElementById('mobile-search-input').value = '';
        renderPosts();
    }
}
// ==========================================
// EXPOSE FUNCTIONS TO WINDOW (For Module Compatibility)
// ==========================================
window.toggleAuthMode = toggleAuthMode;
window.openRecoveryModal = openRecoveryModal;
window.closeAuthModal = closeAuthModal;
window.loginWithOAuth = loginWithOAuth;
window.closeAccountModal = closeAccountModal;
window.toggleAccountActivity = toggleAccountActivity;
window.toggleMaintenance = toggleMaintenance;
window.openMaintenanceModal = openMaintenanceModal;
window.toggleChat = toggleChat;
window.openModal = openModal;
window.closeModal = closeModal;
window.addSocialLink = addSocialLink;
window.toggleOracleInsights = toggleOracleInsights;
window.handleMobileSearch = handleMobileSearch;
window.handleMobileNotifClick = handleMobileNotifClick;
window.exitApp = exitApp;
window.toggleMobileSearch = toggleMobileSearch;
window.handleMobileChat = handleMobileChat;
window.openMobileSettings = openMobileSettings;
window.closeMobileSettings = closeMobileSettings;
window.toggleNotifSound = toggleNotifSound;
window.changeFontSize = changeFontSize;
window.changeLayoutScale = changeLayoutScale;
window.changeHeightScale = changeHeightScale;
window.clearNotifications = clearNotifications;
window.logout = logout;
window.openAuthModal = openAuthModal;
window.handleMobileSearch = handleMobileSearch;
