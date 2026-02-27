/**
 * ROSAE HUB Localization Manager
 * Handles multi-language support (KO, EN, JA, ZH)
 */

const translations = {
    ko: {
        // Nav & Header
        "nav-records": "기록소",
        "nav-chat": "💬 채팅하기",
        "nav-journal": "일지",
        "nav-login": "로그인",
        "nav-signup": "회원가입",
        "nav-logout": "로그아웃",
        "nav-account": "계정 관리",
        "header-subtitle": "기록이 흐르고, 대화가 머무는 곳",
        "welcome-back": "다시 오신 것을 환영합니다, ",
        "welcome-subtitle": "당신의 자원을 탐색하세요.",

        // Sidebar
        "sidebar-cats": "주요 카테고리",
        "sidebar-admin": "관리자 패널",
        "sidebar-connect": "연결",
        "sidebar-bgm": "BGM 플레이어",

        // Feeds
        "best-posts": "베스트 포스트",
        "feeds": "피드",
        "write": "글쓰기",
        "back-to-list": "← 목록으로",
        "comments": "댓글",
        "comment-placeholder": "댓글을 입력하세요...",
        "comment-submit": "등록",
        "comment-login-required": "댓글을 달려면 로그인이 필요합니다.",

        // Settings
        "settings-title": "⚙️ 환경 설정",
        "settings-profile": "👤 내 프로필",
        "settings-profile-desc": "닉네임과 프로필 이미지를 변경합니다.",
        "settings-notif-sound": "🔔 알림 소리",
        "settings-notif-desc": "새 메시지 도착 시 소리로 알립니다.",
        "settings-layout": "레이아웃 조절",
        "settings-layout-desc": "화면 너비와 높이를 조절합니다.",
        "settings-font": "글자 크기",
        "settings-lang": "🌐 언어 설정 (Language)",
        "settings-lang-desc": "시스템 언어를 변경합니다.",
        "confirm": "확인",
        "cancel": "취소",

        // Auth
        "auth-login": "로그인",
        "auth-signup": "회원가입",
        "auth-id": "아이디",
        "auth-pw": "비밀번호",
        "auth-nickname": "닉네임",
        "auth-enter": "입장",
        "auth-no-acc": "계정이 없으신가요?",
        "auth-yes-acc": "이미 계정이 있으신가요?",
        "auth-select-country": "국가 선택",
        "auth-select-lang": "언어 선택",
        "auth-location-consent": "위치 정보 수집 및 이용에 동의합니다 (선택)",

        // Chat (Anticode)
        "chat-channels": "채널 목록",
        "chat-friends": "친구 목록",
        "chat-members": "멤버 목록",
        "chat-add-friend": "친구추가",
        "chat-create-channel": "내 채널 만들기",
        "chat-welcome-title": "ROSAE HUB에 오신 것을 환영합니다!",
        "chat-welcome-desc": "커뮤니티의 시작점입니다. 메시지를 남겨보세요.",
        "chat-input-placeholder": "메시지 보내기...",
        "chat-send": "전송",
        "chat-online": "온라인",
        "chat-back-to-blog": "↩️ 블로그로 돌아가기"
    },
    en: {
        // Nav & Header
        "nav-records": "Records",
        "nav-chat": "💬 Chat",
        "nav-journal": "Journal",
        "nav-login": "Login",
        "nav-signup": "Sign Up",
        "nav-logout": "Logout",
        "nav-account": "Account",
        "header-subtitle": "Where records flow and conversations stay",
        "welcome-back": "Welcome back, ",
        "welcome-subtitle": "Explore your resources.",

        // Sidebar
        "sidebar-cats": "MAIN CATEGORIES",
        "sidebar-admin": "ADMIN PANEL",
        "sidebar-connect": "CONNECT",
        "sidebar-bgm": "BGM PLAYER",

        // Feeds
        "best-posts": "BEST POSTS",
        "feeds": "FEEDS",
        "write": "Write",
        "back-to-list": "← Back to List",
        "comments": "COMMENTS",
        "comment-placeholder": "Enter your comment...",
        "comment-submit": "Submit",
        "comment-login-required": "Login is required to comment.",

        // Settings
        "settings-title": "⚙️ Settings",
        "settings-profile": "👤 My Profile",
        "settings-profile-desc": "Change your nickname and profile image.",
        "settings-notif-sound": "🔔 Notif Sound",
        "settings-notif-desc": "Play sound on new messages.",
        "settings-layout": "Layout Controls",
        "settings-layout-desc": "Adjust screen width and height.",
        "settings-font": "Font Size",
        "settings-lang": "🌐 Language Settings",
        "settings-lang-desc": "Change the system language.",
        "confirm": "Confirm",
        "cancel": "Cancel",

        // Auth
        "auth-login": "Login",
        "auth-signup": "Sign Up",
        "auth-id": "Username",
        "auth-pw": "Password",
        "auth-nickname": "Nickname",
        "auth-enter": "ENTER",
        "auth-no-acc": "Don't have an account?",
        "auth-yes-acc": "Already have an account?",
        "auth-select-country": "Select Country",
        "auth-select-lang": "Select Language",
        "auth-location-consent": "Agree to location collection (Optional)",

        // Chat (Anticode)
        "chat-channels": "Channels",
        "chat-friends": "Friends",
        "chat-members": "Members",
        "chat-add-friend": "Add Friend",
        "chat-create-channel": "Create Channel",
        "chat-welcome-title": "Welcome to ROSAE HUB!",
        "chat-welcome-desc": "This is the start of the community. Leave a message.",
        "chat-input-placeholder": "Send a message...",
        "chat-send": "Send",
        "chat-online": "Online",
        "chat-back-to-blog": "↩️ Back to Blog"
    },
    ja: {
        "nav-records": "記録所",
        "nav-chat": "💬 チャット",
        "nav-journal": "日誌",
        "nav-login": "ログイン",
        "nav-signup": "会員登録",
        "nav-logout": "ログアウト",
        "nav-account": "アカウント管理",
        "header-subtitle": "記録が流れ、会話が留まる場所",
        "welcome-back": "おかえりなさい、 ",
        "welcome-subtitle": "リソースを探索しましょう。",
        "sidebar-cats": "メインカテゴリー",
        "sidebar-admin": "管理者パネル",
        "sidebar-connect": "接続",
        "sidebar-bgm": "BGMプレイヤー",
        "best-posts": "ベストポスト",
        "feeds": "フィード",
        "write": "記事を書く",
        "back-to-list": "← リストに戻る",
        "comments": "コメント",
        "comment-placeholder": "コメントを入力してください...",
        "comment-submit": "登録",
        "comment-login-required": "コメントするにはログインが必要です。",
        "settings-title": "⚙️ 環境設定",
        "settings-profile": "👤 プロフィール",
        "settings-profile-desc": "ニックネームとプロフィール画像を変更します。",
        "settings-notif-sound": "🔔 通知音",
        "settings-notif-desc": "新しいメッセージの到着を音で知らせます。",
        "settings-layout": "レイアウト調整",
        "settings-layout-desc": "画面の幅と高さを調整します。",
        "settings-font": "文字サイズ",
        "settings-lang": "🌐 言語設定",
        "settings-lang-desc": "システム言語を変更します。",
        "confirm": "確認",
        "cancel": "キャンセル",
        "auth-login": "ログイン",
        "auth-signup": "新規登録",
        "auth-id": "ID",
        "auth-pw": "パスワード",
        "auth-nickname": "ニックネーム",
        "auth-enter": "入場",
        "auth-no-acc": "アカウントをお持ちでないですか？",
        "auth-yes-acc": "すでにアカウントをお持ちですか？",
        "auth-select-country": "国を選択",
        "auth-select-lang": "言語を選択",
        "auth-location-consent": "位置情報の収集に同意する (任意)",
        "chat-channels": "チャンネル",
        "chat-friends": "友達",
        "chat-members": "メンバー",
        "chat-add-friend": "友達追加",
        "chat-create-channel": "チャンネル作成",
        "chat-welcome-title": "ROSAE HUBへようこそ！",
        "chat-welcome-desc": "コミュニティの始まりです。メッセージを残しましょう。",
        "chat-input-placeholder": "メッセージを送る...",
        "chat-send": "送信",
        "chat-online": "オンライン",
        "chat-back-to-blog": "↩️ ブログに戻る"
    },
    zh: {
        "nav-records": "记录所",
        "nav-chat": "💬 聊天",
        "nav-journal": "日记",
        "nav-login": "登录",
        "nav-signup": "注册",
        "nav-logout": "注销",
        "nav-account": "账号管理",
        "header-subtitle": "记录流动，对话停留的地方",
        "welcome-back": "欢迎回来, ",
        "welcome-subtitle": "探索您的资源。",
        "sidebar-cats": "主要类别",
        "sidebar-admin": "管理面板",
        "sidebar-connect": "连接",
        "sidebar-bgm": "BGM播放器",
        "best-posts": "推荐文章",
        "feeds": "动态",
        "write": "发帖",
        "back-to-list": "← 返回列表",
        "comments": "评论",
        "comment-placeholder": "输入评论...",
        "comment-submit": "提交",
        "comment-login-required": "登录后即可发表评论。",
        "settings-title": "⚙️ 设置",
        "settings-profile": "👤 我的资料",
        "settings-profile-desc": "修改昵称和头像。",
        "settings-notif-sound": "🔔 提示音",
        "settings-notif-desc": "新消息到达时播放提示音。",
        "settings-layout": "布局调整",
        "settings-layout-desc": "调整屏幕宽度和高度。",
        "settings-font": "字体大小",
        "settings-lang": "🌐 语言设置",
        "settings-lang-desc": "更改系统语言。",
        "confirm": "确定",
        "cancel": "取消",
        "auth-login": "登录",
        "auth-signup": "注册",
        "auth-id": "用户名",
        "auth-pw": "密码",
        "auth-nickname": "昵称",
        "auth-enter": "进入",
        "auth-no-acc": "没有账号？",
        "auth-yes-acc": "已有账号？",
        "auth-select-country": "选择国家",
        "auth-select-lang": "选择语言",
        "auth-location-consent": "同意收集位置信息 (可选)",
        "chat-channels": "频道列表",
        "chat-friends": "好友列表",
        "chat-members": "成员列表",
        "chat-add-friend": "添加好友",
        "chat-create-channel": "创建频道",
        "chat-welcome-title": "欢迎来到 ROSAE HUB!",
        "chat-welcome-desc": "这是社区的起点。留下您的消息。",
        "chat-input-placeholder": "发送消息...",
        "chat-send": "发送",
        "chat-online": "在线",
        "chat-back-to-blog": "↩️ 返回博客"
    }
};

const LanguageManager = {
    currentLang: localStorage.getItem('app_lang') || 'ko',

    init() {
        this.applyTranslations();
    },

    setLanguage(lang) {
        if (!translations[lang]) return;
        this.currentLang = lang;
        localStorage.setItem('app_lang', lang);
        this.applyTranslations();

        // Sync with Supabase if logged in
        if (window.currentUser && window.supabase) {
            window.supabase.from('users')
                .update({ language: lang })
                .eq('username', window.currentUser.username)
                .then(({ error }) => {
                    if (error) console.error('Failed to sync language to DB:', error);
                });
        }
    },

    get(key) {
        return (translations[this.currentLang] && translations[this.currentLang][key]) || key;
    },

    applyTranslations() {
        const uiText = translations[this.currentLang];
        if (!uiText) return;

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const value = uiText[key];
            if (value) {
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    el.placeholder = value;
                } else {
                    el.textContent = value;
                }
            }
        });

        // Special handling for welcome text if it contains dynamic name
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
// Removed export default for classic script compatibility
