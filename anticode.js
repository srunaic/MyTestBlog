// [DEPLOYMENT] Cloudflare Pages Sync - 2026-01-03 10:35
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ==========================================
// 1. CONFIGURATION & GLOBALS
// ==========================================
const SUPABASE_URL = 'VITE_SUPABASE_URL';
const SUPABASE_KEY = 'VITE_SUPABASE_KEY';
const SESSION_KEY = 'nano_dorothy_session';

const CATEGORY_NAMES = {
    notice: '📢 공지사항',
    chat: '💬 채팅방',
    karaoke: '🎤 노래방',
    voice: '📞 보이스 톡',
    game: '🎮 게임 방'

};

const formatDistanceToNow = (date) => {
    if (!date) return '오프라인';
    const now = new Date();
    const diff = Math.floor((now - new Date(date)) / 1000); // seconds
    if (diff < 60) return '방금 전';
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}일 전`;
    return '오래 전';
};

// ==========================================
// 2. CHANNEL CLASS (OO Design)
// ==========================================
class Channel {
    constructor(data) {
        this.id = data.id || data.channel_id;
        this.name = data.name;
        this.type = data.type || 'general';
        this.category = data.category || 'chat';
        this.password = data.password || null;
        this.owner_id = data.owner_id || null;
        this.order = data.order || 0;
    }

    renderHeader() {
        const hash = this.type === 'secret' ? '🔒' : '#';
        const categoryLabel = CATEGORY_NAMES[this.category] || '💬 채팅방';
        return `
            <div class="header-left">
                <span class="channel-hash">${hash}</span>
                <div class="header-title-group">
                    <h1 id="current-channel-name">${this.name}</h1>
                    <span class="header-category-label">${categoryLabel}</span>
                </div>
            </div>
        `;
    }

    renderSidebarItem(isActive, isAdmin) {
        const hash = this.type === 'secret' ? '🔒' : '#';
        const categoryLabel = CATEGORY_NAMES[this.category] || '💬 채팅방';
        const deleteHtml = isAdmin ? `<button class="delete-channel-btn" data-id="${this.id}" onclick="event.stopPropagation(); window.app.deleteChannel('${this.id}')" title="채널 삭제">&times;</button>` : '';
        return `
            <div class="channel-group-item ${isActive ? 'active' : ''}">
                <div class="channel-name-row">
                    <div class="channel-name-label">${hash} ${this.name}</div>
                    ${deleteHtml}
                </div>
                <div class="channel-sub-link" data-id="${this.id}">
                    <span class="sub-link-icon">${categoryLabel}</span>
                </div>
            </div>
        `;
    }

    getPlaceholder() {
        return `#${this.name} 에 메시지 보내기`;
    }
}

// ==========================================
// 3. NOTIFICATION MANAGER
// ==========================================
const NotificationManager = {
    count: 0,
    isSoundOn: localStorage.getItem('nano_notif_sound') !== 'off',
    initialized: false,

    async init() {
        if (this.initialized) return;
        this.updateBadge();
        this.updateButtons();

        // Use a small delay to ensure supabase is ready
        setTimeout(() => this.setupSubscriptions(), 2000);

        this.initialized = true;
    },

    setupSubscriptions() {
        if (!window.app || !window.app.supabase) return;
        const supabase = window.app.supabase;
        console.log('Setting up notification subscriptions for AntiCode...');

        // Post Notifications
        supabase.channel('notif-posts-ac')
            .on('postgres_changes', { event: 'INSERT', table: 'posts' }, payload => {
                this.notify('post', payload.new);
            })
            .on('postgres_changes', { event: 'UPDATE', table: 'posts' }, payload => {
                this.notify('post-update', payload.new);
            })
            .subscribe();

        // Comment Notifications
        supabase.channel('notif-comments-ac')
            .on('postgres_changes', { event: 'INSERT', table: 'comments' }, payload => {
                this.notify('comment', payload.new);
            })
            .on('postgres_changes', { event: 'UPDATE', table: 'comments' }, payload => {
                this.notify('comment-update', payload.new);
            })
            .subscribe();

        // AntiCode Notifications
        supabase.channel('chat-notif-ac')
            .on('postgres_changes', { event: 'INSERT', table: 'anticode_messages' }, payload => {
                this.notify('chat', payload.new);
            }).subscribe();
    },

    notify(type, data) {
        // Increment count
        this.count++;
        if (this.count > 100) this.count = 100;

        this.updateBadge();
        this.playSound();
    },

    playSound() {
        if (!this.isSoundOn) return;
        const audio = document.getElementById('notif-sound');
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(e => console.warn('Sound play blocked by browser policy. Interaction needed.'));
        }
    },

    updateBadge() {
        const badge = document.getElementById('notif-badge');
        const display = document.getElementById('notif-count-display');
        if (!badge || !display) return;

        if (this.count > 0) {
            badge.classList.add('active');
            display.style.display = 'block';
            display.textContent = this.count > 99 ? '99+' : this.count;
        } else {
            badge.classList.remove('active');
            display.style.display = 'none';
        }
    },

    toggleSound() {
        this.isSoundOn = !this.isSoundOn;
        localStorage.setItem('nano_notif_sound', this.isSoundOn ? 'on' : 'off');
        this.updateButtons();
    },

    updateButtons() {
        const btns = document.querySelectorAll('.notif-toggle-btn');
        btns.forEach(btn => {
            const isSettings = btn.id === 'notif-toggle-settings';

            if (this.isSoundOn) {
                btn.classList.add('on');
                btn.innerHTML = (isSettings) ? '🔔 ON' : '🔔 알림 소리 ON';
            } else {
                btn.classList.remove('on');
                btn.innerHTML = (isSettings) ? '🔕 OFF' : '🔕 알림 소리 OFF';
            }
        });
    },

    clearNotifications() {
        this.count = 0;
        this.updateBadge();
    }
};

window.toggleNotifSound = () => NotificationManager.toggleSound();
window.clearNotifications = () => NotificationManager.clearNotifications();
class AntiCodeApp {
    constructor() {
        this.supabase = null;
        this.currentUser = null;
        this.channels = [];
        this.friends = [];
        this.userCache = {}; // Cache for nickname and avatars
        this.activeChannel = null;
        this.presenceChannel = null;
        this.channelPresenceChannel = null; // per-room presence (who is in this channel)
        this.messageSubscription = null;
        this.unlockedChannels = new Set();
        this.unlockedStorageKey = null; // per-user localStorage key (set after auth)
        this.sentMessageCache = new Set(); // To prevent duplicates in Optimistic UI
        this.isAdminMode = false;
        this.userRequestCache = {}; // Dedup in-flight user info requests
        this.processedMessageIds = new Set(); // To prevent duplicates (Broadcast vs Postgres)
        this.recentMessageFingerprints = new Map(); // Dedup Broadcast vs Postgres when IDs differ
        this.friendsSchema = null; // Cache detected anticode_friends column names
        this.channelMembers = []; // usernames invited/joined for current channel
        this.messageQueue = [];
        this.isProcessingQueue = false;
    }

    _resetMessageDedupeState() {
        // Important: if we keep processed IDs across channel switches,
        // initial history render can get skipped and the chat looks empty.
        this.processedMessageIds = new Set();
        this.recentMessageFingerprints = new Map();
        this.sentMessageCache = new Set();
        this.messageQueue = [];
        this.isProcessingQueue = false;
    }

    async compressImageFile(file, maxDim = 1280, quality = 0.78) {
        // Client-side resize/compress to speed up uploads on slow networks.
        try {
            if (!file || !file.type || !file.type.startsWith('image/')) return file;
            const img = await createImageBitmap(file);
            const w = img.width, h = img.height;
            const scale = Math.min(1, maxDim / Math.max(w, h));
            const tw = Math.max(1, Math.round(w * scale));
            const th = Math.max(1, Math.round(h * scale));

            const canvas = document.createElement('canvas');
            canvas.width = tw; canvas.height = th;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, tw, th);
            img.close?.();

            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
            if (!blob) return file;
            const safeName = (file.name || 'image').replace(/\.[^/.]+$/, '') + '.jpg';
            return new File([blob], safeName, { type: 'image/jpeg' });
        } catch (_) {
            return file;
        }
    }

    escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    linkify(escapedText) {
        // escapedText must already be HTML-escaped.
        const text = String(escapedText ?? '');
        const urlRe = /(https?:\/\/[^\s<]+[^\s<\.)\],!?])/g;
        return text.replace(urlRe, (rawUrl) => {
            const url = rawUrl;
            const lower = url.toLowerCase();
            const isYouTube = lower.includes('youtube.com') || lower.includes('youtu.be');
            const label = isYouTube ? '🎬 YouTube 링크' : url;
            return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
        });
    }

    filterProfanity(text) {
        const input = String(text ?? '');
        if (!input) return { text: input, flagged: false };

        // NOTE: This is a best-effort filter (client-side). Expand list as needed.
        const patterns = [
            // Korean profanity (common variants)
            /씨\s*발/gi,
            /시\s*발/gi,
            /ㅅ\s*ㅂ/gi,
            /ㅆ\s*ㅂ/gi,
            /병\s*신/gi,
            /븅\s*신/gi,
            /좆/gi,
            /존\s*나/gi,
            /개\s*새\s*끼/gi,
            /새\s*끼/gi,
            /미\s*친/gi,
            // English profanity
            /\bfuck(?:ing|er|ers|ed)?\b/gi,
            /\bshit(?:ty|ting|ter|ters)?\b/gi,
            /\bbitch(?:es|y)?\b/gi,
            /\basshole\b/gi,
            /\bcunt\b/gi,
            /\bdick\b/gi,
            /\bpussy\b/gi,
            /\bmotherfucker\b/gi,
            /\bbastard\b/gi,
            /\bnigg(?:er|a)\b/gi
        ];

        let out = input;
        let flagged = false;
        for (const re of patterns) {
            if (re.test(out)) {
                flagged = true;
                out = out.replace(re, '***');
            }
        }
        return { text: out, flagged };
    }

    async ensureCurrentUserChannelMembership(channelId) {
        // Record that current user has joined/visited this channel so they appear in member list.
        try {
            await this.supabase
                .from('anticode_channel_members')
                .upsert([{
                    channel_id: channelId,
                    username: this.currentUser.username,
                    invited_by: null
                }], { onConflict: 'channel_id,username' });
        } catch (e) {
            // Table may not exist yet or RLS may block; don't break chat.
            console.warn('ensureCurrentUserChannelMembership failed:', e?.message || e);
        }
    }

    async loadChannelMembers(channelId) {
        try {
            const { data, error } = await this.supabase
                .from('anticode_channel_members')
                .select('username')
                .eq('channel_id', channelId);
            if (error) throw error;
            const names = (data || []).map(r => r.username).filter(Boolean).map(String);
            // Always include myself and channel owner if present
            const chan = this.channels.find(c => c.id === channelId);
            if (this.currentUser?.username) names.push(this.currentUser.username);
            if (chan?.owner_id) names.push(String(chan.owner_id));
            this.channelMembers = Array.from(new Set(names));
        } catch (e) {
            console.warn('loadChannelMembers failed:', e?.message || e);
            this.channelMembers = this.currentUser?.username ? [this.currentUser.username] : [];
        }
    }

    _isAllowedInChannel(channelId) {
        const ch = this.channels.find(c => c.id === channelId);
        if (!ch) return false;
        // Non-secret channels are open
        if (ch.type !== 'secret') return true;
        // Secret channels: owner or invited member only
        if (ch.owner_id && ch.owner_id === this.currentUser?.username) return true;
        return (this.channelMembers || []).includes(this.currentUser?.username);
    }

    async updateChannelMemberPanel(state) {
        const memberList = document.getElementById('member-list');
        const onlineCountText = document.getElementById('online-count');
        if (!memberList) return;

        const onlineUsers = [];
        for (const id in (state || {})) onlineUsers.push(state[id][0]);
        const onlineUsernames = new Set(onlineUsers.map(u => u.username));
        if (onlineCountText) onlineCountText.innerText = String(onlineUsers.length);

        const friendUsernames = new Set(this.friends.map(f => f.username));
        const allUsernames = Array.from(new Set([...(this.channelMembers || []), ...onlineUsernames]));

        // Online first
        const ordered = [
            ...allUsernames.filter(u => onlineUsernames.has(u)),
            ...allUsernames.filter(u => !onlineUsernames.has(u))
        ];

        const onlineMap = new Map(onlineUsers.map(u => [u.username, u]));
        const parts = [];
        for (const uname of ordered) {
            const presenceUser = onlineMap.get(uname);
            const isOnline = !!presenceUser;
            const info = isOnline ? presenceUser : await this.getUserInfo(uname);
            const nick = info?.nickname || uname;
            const avatar = info?.avatar_url;
            const isFriend = friendUsernames.has(uname);
            parts.push(`
                <div class="member-card ${isOnline ? 'online' : 'offline'}">
                    <div class="avatar-wrapper">
                        ${avatar ? `<img src="${avatar}" class="avatar-sm" onerror="this.onerror=null; this.src=''; this.style.display='none'; this.nextElementSibling.style.display='flex'">` : ''}
                        <div class="avatar-sm" style="${avatar ? 'display:none;' : ''}">${nick[0]}</div>
                        ${isOnline ? '<span class="online-dot"></span>' : ''}
                    </div>
                    <div class="member-info">
                        <span class="member-name-text">${nick} ${isFriend ? '<span class="friend-badge">[친구]</span>' : ''}</span>
                        <span class="member-status-sub">${isOnline ? '온라인' : '오프라인'}</span>
                    </div>
                </div>
            `);
        }

        memberList.innerHTML = parts.join('');
    }

    setupChannelPresence(channelId) {
        try {
            if (this.channelPresenceChannel) this.supabase.removeChannel(this.channelPresenceChannel);
        } catch (_) { }

        this.channelPresenceChannel = this.supabase.channel(`presence_${channelId}`, {
            config: { presence: { key: this.currentUser.username } }
        });

        this.channelPresenceChannel
            .on('presence', { event: 'sync' }, async () => {
                const state = this.channelPresenceChannel.presenceState();
                await this.updateChannelMemberPanel(state);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    const trackData = {
                        username: this.currentUser.username,
                        nickname: this.currentUser.nickname,
                        uid: this.currentUser.uid,
                        avatar_url: this.currentUser.avatar_url,
                        online_at: new Date().toISOString(),
                    };
                    try { await this.channelPresenceChannel.track(trackData); } catch (_) { }
                }
            });
    }

    _getCleanupSettingsKey() {
        const u = this.currentUser?.username || 'anonymous';
        return `anticode_chat_cleanup_settings::${u}`;
    }

    _getCleanupLastRunKey() {
        const u = this.currentUser?.username || 'anonymous';
        return `anticode_chat_cleanup_last_run::${u}`;
    }

    _loadCleanupSettings() {
        try {
            const raw = localStorage.getItem(this._getCleanupSettingsKey());
            if (!raw) return { enabled: true };
            const parsed = JSON.parse(raw);
            return { enabled: parsed?.enabled !== false };
        } catch (_) {
            return { enabled: true };
        }
    }

    _saveCleanupSettings(enabled) {
        try {
            localStorage.setItem(this._getCleanupSettingsKey(), JSON.stringify({ enabled: !!enabled }));
        } catch (_) { }
    }

    _getLastCleanupRunMs() {
        try {
            const raw = localStorage.getItem(this._getCleanupLastRunKey());
            const n = Number(raw);
            return Number.isFinite(n) ? n : 0;
        } catch (_) {
            return 0;
        }
    }

    _setLastCleanupRunMs(ms) {
        try {
            localStorage.setItem(this._getCleanupLastRunKey(), String(ms));
        } catch (_) { }
    }

    _formatDateTime(ms) {
        if (!ms) return '-';
        try { return new Date(ms).toLocaleString(); } catch (_) { return '-'; }
    }

    async cleanupOldMessages(days = 90) {
        if (!this.isAdminMode) return { ok: false, error: 'not_admin' };
        const cutoffMs = Date.now() - (days * 24 * 60 * 60 * 1000);
        const cutoffIso = new Date(cutoffMs).toISOString();
        const { error } = await this.supabase
            .from('anticode_messages')
            .delete()
            .lt('created_at', cutoffIso);
        if (error) return { ok: false, error };
        this._setLastCleanupRunMs(Date.now());
        return { ok: true };
    }

    async maybeAutoCleanupMessages() {
        if (!this.isAdminMode) return;
        const settings = this._loadCleanupSettings();
        if (!settings.enabled) return;

        const last = this._getLastCleanupRunMs();
        const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
        if (last && (Date.now() - last) < ninetyDaysMs) return;

        try {
            const res = await this.cleanupOldMessages(90);
            if (!res.ok) console.warn('Auto cleanup failed:', res.error);
        } catch (e) {
            console.warn('Auto cleanup error:', e);
        }
    }

    _getUnlockedStorageKey() {
        const u = this.currentUser?.username || 'anonymous';
        return `anticode_unlocked_channels::${u}`;
    }

    _loadUnlockedChannels() {
        try {
            this.unlockedStorageKey = this._getUnlockedStorageKey();
            const raw = localStorage.getItem(this.unlockedStorageKey);
            if (!raw) return;
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
                arr.forEach((id) => id && this.unlockedChannels.add(String(id)));
            }
        } catch (_) { /* ignore */ }
    }

    _saveUnlockedChannels() {
        try {
            if (!this.unlockedStorageKey) this.unlockedStorageKey = this._getUnlockedStorageKey();
            localStorage.setItem(this.unlockedStorageKey, JSON.stringify(Array.from(this.unlockedChannels)));
        } catch (_) { /* ignore */ }
    }

    normalizeUID(input) {
        // Convert full-width digits (０-９) to ASCII (0-9) and strip whitespace/symbols
        if (input == null) return '';
        let s = String(input).trim();
        s = s.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 0x30));
        s = s.replace(/[^\d]/g, '');
        return s;
    }

    async _fetchFriendUsernames() {
        // Try common schemas to avoid hard-failing with PostgREST 400 when columns differ
        const schemas = [
            { userCol: 'user_username', friendCol: 'friend_username' },
            { userCol: 'user_id', friendCol: 'friend_id' },
            { userCol: 'user_id', friendCol: 'friend_username' },
            { userCol: 'username', friendCol: 'friend_username' }
        ];

        let lastError = null;
        for (const schema of schemas) {
            const { data, error } = await this.supabase
                .from('anticode_friends')
                .select(schema.friendCol)
                .eq(schema.userCol, this.currentUser.username);

            if (!error) {
                this.friendsSchema = schema;
                return data || [];
            }
            lastError = error;
        }
        throw lastError;
    }

    async uploadFile(file, bucket = 'uploads') {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { data, error } = await this.supabase.storage
            .from(bucket)
            .upload(filePath, file);

        if (error) {
            console.error('Upload error:', error);
            throw error;
        }

        const { data: { publicUrl } } = this.supabase.storage
            .from(bucket)
            .getPublicUrl(filePath);

        return publicUrl;
    }

    async init() {
        console.log('AntiCode Feature App initializing...');

        // Initialize Notifications Early
        NotificationManager.init();

        this.currentUser = this.getAuth();
        if (!this.currentUser) {
            document.getElementById('auth-guard').style.display = 'flex';
            return;
        }
        this.isAdminMode = this.currentUser.role === 'admin';

        try {
            this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

            // Restore secret-channel unlocks for this user (password once per device/account)
            this._loadUnlockedChannels();

            // Admin-only: auto-clean old chat messages on a 90-day cadence
            await this.maybeAutoCleanupMessages();

            // 1. Sync User Metadata
            await this.syncUserMetadata();

            // 2. Load Data
            await this.loadChannels();
            await this.loadFriends();

            // 3. Setup UI
            this.setupEventListeners();
            this.renderUserInfo();
            this.setupPresence();

            // 4. Default Channel
            if (this.channels.length > 0) {
                await this.switchChannel(this.channels[0].id);
            }
        } catch (e) {
            console.error('App Init Error:', e);
        }
    }

    getAuth() {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw);
        if (Date.now() > session.expiresAt) return null;
        return session;
    }

    async syncUserMetadata() {
        let { data, error } = await this.supabase
            .from('anticode_users')
            .select('*')
            .eq('username', this.currentUser.username)
            .single();

        if (error || !data) {
            const newUID = Math.floor(100000 + Math.random() * 900000).toString();
            const newUser = {
                username: this.currentUser.username,
                nickname: this.currentUser.nickname,
                uid: newUID,
                avatar_url: null
            };
            await this.supabase.from('anticode_users').upsert(newUser);
            this.currentUser = { ...this.currentUser, ...newUser };
        } else {
            this.currentUser = { ...this.currentUser, ...data };
        }

        // Cache current user
        this.userCache[this.currentUser.username] = {
            nickname: this.currentUser.nickname,
            avatar_url: this.currentUser.avatar_url
        };
    }

    async getUserInfo(username) {
        if (this.userCache[username]) return this.userCache[username];
        if (this.userRequestCache[username]) return this.userRequestCache[username];

        const fetchInfo = async () => {
            try {
                const { data, error } = await this.supabase
                    .from('anticode_users')
                    .select('nickname, avatar_url')
                    .eq('username', username)
                    .single();

                if (!error && data) {
                    this.userCache[username] = data;
                    return data;
                }
            } catch (e) {
                console.error('getUserInfo error:', e);
            } finally {
                delete this.userRequestCache[username];
            }
            return { nickname: username, avatar_url: null };
        };

        this.userRequestCache[username] = fetchInfo();
        return this.userRequestCache[username];
    }

    async updateProfile(nickname, avatarUrl) {
        try {
            const { error } = await this.supabase
                .from('anticode_users')
                .update({ nickname, avatar_url: avatarUrl })
                .eq('username', this.currentUser.username);

            if (!error) {
                this.currentUser.nickname = nickname;
                this.currentUser.avatar_url = avatarUrl;
                this.userCache[this.currentUser.username] = { nickname, avatar_url: avatarUrl };
                this.renderUserInfo();
                const session = JSON.parse(localStorage.getItem(SESSION_KEY));
                if (session) {
                    session.nickname = nickname;
                    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
                }
                return true;
            }
        } catch (e) {
            console.error('Update profile error:', e);
        }
        return false;
    }

    async loadFriends() {
        try {
            // Step 1: Fetch friend usernames (robust to schema differences)
            const friendsData = await this._fetchFriendUsernames();
            if (!friendsData || friendsData.length === 0) {
                this.friends = [];
                this.renderFriends();
                return;
            }

            const friendCol = this.friendsSchema?.friendCol || 'friend_username';
            const usernames = friendsData.map(f => f[friendCol]).filter(Boolean);

            // Step 2: Batch fetch user info for all friends to populate cache
            const { data: usersData, error: usersError } = await this.supabase
                .from('anticode_users')
                .select('username, nickname, uid, avatar_url')
                .in('username', usernames);

            if (usersError) throw usersError;

            // Update user cache
            if (usersData) {
                usersData.forEach(u => {
                    this.userCache[u.username] = {
                        nickname: u.nickname,
                        uid: u.uid,
                        avatar_url: u.avatar_url
                    };
                });
            }

            // Construct friends list from cache
            this.friends = usernames.map(uname => {
                const info = this.userCache[uname];
                return {
                    username: uname,
                    nickname: info ? info.nickname : uname,
                    uid: info ? info.uid : '000000',
                    avatar_url: info ? info.avatar_url : null,
                    online: false
                };
            });

            this.renderFriends();
        } catch (error) {
            console.error('Failed to load friends:', error);
        }
    }

    async addFriendByUID(uid) {
        const normalizedUID = this.normalizeUID(uid);
        if (!normalizedUID) { alert('사용자를 찾을 수 없습니다.'); return false; }

        const { data: target, error: searchError } = await this.supabase
            .from('anticode_users')
            .select('username')
            .eq('uid', normalizedUID)
            .maybeSingle();

        if (searchError || !target) { alert('사용자를 찾을 수 없습니다.'); return false; }
        if (target.username === this.currentUser.username) { alert('자기 자신은 친구로 추가할 수 없습니다.'); return false; }

        // Ensure we use the right anticode_friends schema for insert
        if (!this.friendsSchema) {
            try { await this._fetchFriendUsernames(); } catch (_) { /* ignore */ }
        }
        const userCol = this.friendsSchema?.userCol || 'user_username';
        const friendCol = this.friendsSchema?.friendCol || 'friend_username';

        const { error: addError } = await this.supabase
            .from('anticode_friends')
            .insert([{ [userCol]: this.currentUser.username, [friendCol]: target.username }]);

        if (addError) { alert('이미 친구거나 오류가 발생했습니다.'); return false; }

        await this.loadFriends();
        return true;
    }

    renderFriends() {
        const list = document.getElementById('friend-list');
        if (!list) return;

        const displayFriends = this.friends.slice(0, 3);
        const hasMore = this.friends.length > 3;

        let html = displayFriends.map(f => `
            <li class="friend-item ${f.online ? 'online' : 'offline'}" data-username="${f.username}">
                <div class="avatar-sm-container">
                    ${f.avatar_url ? `<img src="${f.avatar_url}" class="avatar-sm" onerror="this.onerror=null; this.src=''; this.style.display='none'; this.nextElementSibling.style.display='flex'">` : ''}
                    <div class="avatar-sm" style="${f.avatar_url ? 'display:none;' : ''}">${f.nickname[0]}</div>
                    <span class="status-indicator"></span>
                </div>
                <div class="friend-info">
                    <span class="friend-nickname">${f.nickname} <small>#${f.uid}</small></span>
                    <span class="friend-status-text">${f.online ? '온라인' : formatDistanceToNow(f.last_seen)}</span>
                </div>
            </li>
        `).join('');

        if (hasMore) {
            html += `
                <li class="view-all-friends" onclick="window.app && window.app.openFriendModal && window.app.openFriendModal()">
                    친구 더 보기...
                </li>
            `;
        }
        list.innerHTML = html;
    }

    openFriendModal() {
        const modal = document.getElementById('friend-modal');
        if (!modal) return;
        modal.style.display = 'flex';
        this.renderFriendModalList();
    }

    closeFriendModal() {
        const modal = document.getElementById('friend-modal');
        if (!modal) return;
        modal.style.display = 'none';
    }

    renderFriendModalList() {
        const container = document.getElementById('friend-modal-list');
        if (!container) return;

        const activeChannelName = this.activeChannel?.name || '';
        const canInvite = !!this.activeChannel;

        if (!this.friends || this.friends.length === 0) {
            container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem;">친구가 없습니다.</div>`;
            return;
        }

        container.innerHTML = this.friends.map(f => `
            <div class="member-card ${f.online ? 'online' : 'offline'}" style="margin-bottom:8px;">
                <div class="avatar-wrapper">
                    ${f.avatar_url ? `<img src="${f.avatar_url}" class="avatar-sm" onerror="this.onerror=null; this.src=''; this.style.display='none'; this.nextElementSibling.style.display='flex'">` : ''}
                    <div class="avatar-sm" style="${f.avatar_url ? 'display:none;' : ''}">${(f.nickname || f.username)[0]}</div>
                    ${f.online ? '<span class="online-dot"></span>' : ''}
                </div>
                <div class="member-info" style="flex:1;">
                    <span class="member-name-text">${f.nickname} <small>#${f.uid}</small></span>
                    <span class="member-status-sub">${f.online ? '온라인' : '오프라인'}</span>
                </div>
                <button class="notif-toggle-btn" style="white-space:nowrap; ${canInvite ? '' : 'opacity:0.5;'}"
                    ${canInvite ? '' : 'disabled'}
                    onclick="window.app && window.app.inviteFriendToActiveChannel && window.app.inviteFriendToActiveChannel('${f.username}')">
                    ${canInvite ? `초대 (${activeChannelName})` : '채널 선택 필요'}
                </button>
            </div>
        `).join('');
    }

    async inviteFriendToActiveChannel(friendUsername) {
        if (!this.activeChannel) return alert('먼저 채널을 선택하세요.');
        if (!friendUsername) return;

        // 친구만 초대 가능
        const isFriend = this.friends?.some(f => f.username === friendUsername);
        if (!isFriend) return alert('친구만 초대할 수 있습니다.');

        try {
            const payload = {
                channel_id: this.activeChannel.id,
                username: friendUsername,
                invited_by: this.currentUser.username,
                created_at: new Date().toISOString()
            };
            const { error } = await this.supabase
                .from('anticode_channel_members')
                .upsert([payload], { onConflict: 'channel_id,username' });
            if (error) {
                console.error('Invite error:', error);
                alert('초대 실패: ' + error.message + '\\n\\n(필요 테이블: anticode_channel_members)');
                return;
            }
            // Refresh panel state if we're in this channel
            await this.loadChannelMembers(this.activeChannel.id);
            if (this.channelPresenceChannel) {
                try { await this.updateChannelMemberPanel(this.channelPresenceChannel.presenceState()); } catch (_) { }
            }
            alert('초대 완료!');
        } catch (e) {
            console.error('Invite exception:', e);
            alert('초대 실패: ' + (e?.message || e));
        }
    }

    async loadChannels() {
        const { data, error } = await this.supabase.from('anticode_channels').select('*').order('order', { ascending: true });
        if (!error && data && data.length > 0) {
            this.channels = data.map(d => {
                // Set default password for '비밀 실험실'
                if (d.name === '비밀 실험실') d.password = '367912';
                return new Channel(d);
            });
        }
        else this.channels = [new Channel({ id: 'general', name: '일상-채팅', type: 'general', category: 'chat' })];
        this.renderChannels();
    }

    renderChannels() {
        const container = document.getElementById('categorized-channels');
        container.innerHTML = '';
        const categories = {};
        this.channels.forEach(ch => {
            if (!categories[ch.category]) categories[ch.category] = [];
            categories[ch.category].push(ch);
        });

        Object.keys(CATEGORY_NAMES).forEach(catId => {
            const chans = categories[catId] || [];
            if (chans.length === 0 && catId !== 'chat') return;
            const group = document.createElement('div');
            group.className = 'channel-group';
            group.innerHTML = `
                <div class="group-header">
                    <span class="group-label">${CATEGORY_NAMES[catId]}</span>
                    ${(catId === 'chat' && this.isAdminMode) ? '<button id="open-create-channel-cat" class="add-channel-btn">+</button>' : ''}
                </div>
                <div class="sidebar-list">
                    ${chans.map(c => c.renderSidebarItem(this.activeChannel && c.id === this.activeChannel.id, this.isAdminMode)).join('')}
                </div>
            `;
            container.appendChild(group);
        });

        container.querySelectorAll('.channel-sub-link').forEach(item => {
            item.onclick = () => this.handleChannelSwitch(item.dataset.id);
        });
        const createBtn = document.getElementById('open-create-channel-cat');
        if (createBtn) createBtn.onclick = () => document.getElementById('create-channel-modal').style.display = 'flex';
    }

    async handleChannelSwitch(channelId) {
        const channel = this.channels.find(c => c.id === channelId);
        if (!channel) return;

        // If user clicks the already-active channel, do nothing (prevents reloading/clearing messages)
        if (this.activeChannel && this.activeChannel.id === channelId) {
            // Close sidebar on mobile
            document.querySelector('.anticode-sidebar')?.classList.remove('open');
            document.querySelector('.anticode-members')?.classList.remove('open');
            return;
        }

        // Password persistence check (even for owners)
        if (channel.type === 'secret' && channel.password && !this.unlockedChannels.has(channelId)) {
            this.pendingChannelId = channelId;
            document.getElementById('password-entry-modal').style.display = 'flex';
            document.getElementById('entry-password-input').focus();
            return;
        }

        // Close sidebar on mobile after switch
        document.querySelector('.anticode-sidebar').classList.remove('open');
        document.querySelector('.anticode-members').classList.remove('open');

        await this.switchChannel(channelId);
    }

    async switchChannel(channelId) {
        const channel = this.channels.find(c => c.id === channelId);
        if (!channel) return;
        this.activeChannel = channel;
        this._resetMessageDedupeState();
        this.unlockedChannels.add(channelId);
        this._saveUnlockedChannels();
        this.renderChannels();

        // Update header info safely
        const headerLeft = document.querySelector('.header-left');
        if (headerLeft) {
            headerLeft.outerHTML = channel.renderHeader();
        }

        // Handle delete button in the "More Options" dropdown
        const dropdown = document.getElementById('mobile-dropdown-menu');
        let delBtn = document.getElementById('menu-delete-channel');

        if (channel.owner_id === this.currentUser.username) {
            if (!delBtn && dropdown) {
                const btn = document.createElement('button');
                btn.id = 'menu-delete-channel';
                btn.className = 'menu-item-danger';
                btn.textContent = '❌ 채널 삭제';
                dropdown.appendChild(btn);
                delBtn = btn;
            }
            if (delBtn) delBtn.onclick = (e) => {
                e.stopPropagation();
                if (dropdown) dropdown.style.display = 'none';
                this.deleteChannel(channel.id);
            };
        } else if (delBtn) {
            delBtn.remove();
        }

        // Load channel members first (needed for secret-channel access checks)
        await this.loadChannelMembers(channel.id);

        // Secret channel gate: invited-only (or owner)
        if (channel.type === 'secret' && !this._isAllowedInChannel(channel.id)) {
            alert('이 비밀 채팅방은 초대된 멤버만 입장할 수 있습니다.');
            // Attempt to fall back to a non-secret channel
            const fallback = this.channels.find(c => c.type !== 'secret') || this.channels[0];
            if (fallback && fallback.id !== channel.id) {
                await this.switchChannel(fallback.id);
            }
            return;
        }

        // For non-secret channels (or owner), mark myself as a member so I show up.
        if (channel.type !== 'secret' || channel.owner_id === this.currentUser?.username) {
            await this.ensureCurrentUserChannelMembership(channel.id);
            await this.loadChannelMembers(channel.id);
        }

        document.getElementById('chat-input').placeholder = channel.getPlaceholder();
        await this.loadMessages(channel.id);
        this.setupMessageSubscription(channel.id);

        // Per-channel online panel
        this.setupChannelPresence(channel.id);
        try { await this.updateChannelMemberPanel(this.channelPresenceChannel.presenceState()); } catch (_) { }
    }

    async deleteChannel(channelId) {
        if (!confirm('정말로 이 채널을 삭제하시겠습니까? 채널의 모든 메시지 기록이 영구적으로 삭제됩니다.')) return;

        // 1. Delete associated messages
        await this.supabase.from('anticode_messages').delete().eq('channel_id', channelId);

        // 2. Delete the channel itself
        const { error } = await this.supabase.from('anticode_channels').delete().eq('id', channelId);
        if (!error) {
            this.channels = this.channels.filter(c => c.id !== channelId);
            this.renderChannels();

            if (this.channels.length > 0) {
                await this.switchChannel(this.channels[0].id);
            } else {
                location.reload();
            }
        } else {
            alert('삭제에 실패했습니다: ' + error.message);
        }
    }

    async createChannel(name, type, category, password) {
        if (!this.isAdminMode) {
            alert('방장만 채널을 생성할 수 있습니다.');
            return false;
        }
        const { data, error } = await this.supabase.from('anticode_channels').insert([{
            name, type, category, password: type === 'secret' ? password : null,
            owner_id: this.currentUser.username, order: this.channels.length
        }]).select();
        if (!error && data) {
            const newChan = new Channel(data[0]);
            this.channels.push(newChan);
            this.renderChannels();
            this.switchChannel(newChan.id);
            return true;
        }
        return false;
    }

    async loadMessages(channelId) {
        const { data, error } = await this.supabase
            .from('anticode_messages')
            .select('*')
            .eq('channel_id', channelId)
            .order('created_at', { ascending: true })
            .limit(50);

        if (error) {
            // Don't wipe existing messages on transient errors
            console.error('Failed to load messages:', error);
            return;
        }

        const container = document.getElementById('message-container');
        if (!container) return;
        container.innerHTML = '';
        for (const msg of (data || [])) await this.appendMessage(msg);
    }

    setupMessageSubscription(channelId) {
        if (this.messageSubscription) this.supabase.removeChannel(this.messageSubscription);

        console.log(`Subscribing to real-time messages for channel: ${channelId}`);
        this.messageSubscription = this.supabase
            .channel(`channel_${channelId}`, {
                config: {
                    broadcast: { self: false }
                }
            })
            .on('broadcast', { event: 'chat' }, payload => {
                this.queueMessage(payload.payload);
            })
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'anticode_messages',
                filter: `channel_id=eq.${channelId}`
            }, payload => {
                this.queueMessage(payload.new);
            })
            .subscribe((status) => {
                console.log(`Subscription status for ${channelId}:`, status);
            });
    }

    queueMessage(msg, isOptimistic = false) {
        this.messageQueue.push({ msg, isOptimistic });
        this.processQueue();
    }

    async processQueue() {
        if (this.isProcessingQueue || this.messageQueue.length === 0) return;
        this.isProcessingQueue = true;

        while (this.messageQueue.length > 0) {
            const { msg, isOptimistic } = this.messageQueue.shift();
            try {
                await this.appendMessage(msg, isOptimistic);
            } catch (e) {
                console.error('Error processing message in queue:', e, msg);
            }
        }

        this.isProcessingQueue = false;
    }

    setupPresence() {
        this.presenceChannel = this.supabase.channel('online-users');
        this.presenceChannel
            .on('presence', { event: 'sync' }, () => {
                const state = this.presenceChannel.presenceState();
                this.syncFriendStatus(state);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    const trackData = {
                        username: this.currentUser.username,
                        nickname: this.currentUser.nickname,
                        uid: this.currentUser.uid,
                        avatar_url: this.currentUser.avatar_url,
                        online_at: new Date().toISOString(),
                    };
                    await this.presenceChannel.track(trackData);

                    // Periodic last_seen update in DB
                    this.updateLastSeen();
                    if (this.lastSeenInterval) clearInterval(this.lastSeenInterval);
                    this.lastSeenInterval = setInterval(() => this.updateLastSeen(), 60000);
                }
            });
    }

    async updateLastSeen() {
        if (!this.currentUser) return;
        try {
            await this.supabase
                .from('anticode_users')
                .update({ last_seen: new Date().toISOString() })
                .eq('username', this.currentUser.username);
        } catch (e) {
            console.error('Failed to update last_seen:', e);
        }
    }

    async updateOnlineUsers(state) {
        const memberList = document.getElementById('member-list');
        const onlineCountText = document.getElementById('online-count');
        if (!memberList) return;

        const onlineUsers = [];
        for (const id in state) onlineUsers.push(state[id][0]);
        if (onlineCountText) onlineCountText.innerText = onlineUsers.length;

        const friendUsernames = new Set(this.friends.map(f => f.username));

        // Members list will show online users first, then offline friends
        const offlineFriends = this.friends.filter(f => !f.online);

        let html = onlineUsers.map(user => {
            const isFriend = friendUsernames.has(user.username);
            return `
                <div class="member-card online">
                    <div class="avatar-wrapper">
                        ${user.avatar_url ? `<img src="${user.avatar_url}" class="avatar-sm" onerror="this.onerror=null; this.src=''; this.style.display='none'; this.nextElementSibling.style.display='flex'">` : ''}
                        <div class="avatar-sm" style="${user.avatar_url ? 'display:none;' : ''}">${user.nickname[0]}</div>
                        <span class="online-dot"></span>
                    </div>
                    <div class="member-info">
                        <span class="member-name-text">${user.nickname} ${isFriend ? '<span class="friend-badge">[친구]</span>' : ''}</span>
                        <span class="member-status-sub">온라인</span>
                    </div>
                </div>
            `;
        }).join('');

        html += offlineFriends.map(f => `
            <div class="member-card offline">
                <div class="avatar-wrapper">
                    ${f.avatar_url ? `<img src="${f.avatar_url}" class="avatar-sm" onerror="this.onerror=null; this.src=''; this.style.display='none'; this.nextElementSibling.style.display='flex'">` : ''}
                    <div class="avatar-sm" style="${f.avatar_url ? 'display:none;' : ''}">${f.nickname[0]}</div>
                </div>
                <div class="member-info">
                    <span class="member-name-text">${f.nickname} <span class="friend-badge">[친구]</span></span>
                    <span class="member-status-sub">${formatDistanceToNow(f.last_seen)}</span>
                </div>
            </div>
        `).join('');

        memberList.innerHTML = html;
    }

    syncFriendStatus(state) {
        const onlineUsernames = [];
        for (const id in state) onlineUsernames.push(state[id][0].username);
        this.friends.forEach(f => { f.online = onlineUsernames.includes(f.username); });
        this.renderFriends();
    }

    async sendMessage() {
        const input = document.getElementById('chat-input');
        let content = input.value.trim();
        if (!content || !this.activeChannel) return;

        // Secret channels: invited-only write
        if (this.activeChannel.type === 'secret' && !this._isAllowedInChannel(this.activeChannel.id)) {
            alert('초대된 멤버만 이 비밀 채팅방에 글을 쓸 수 있습니다.');
            return;
        }

        // Profanity filter
        const filtered = this.filterProfanity(content);
        content = filtered.text;

        const tempId = 'msg_' + Date.now() + Math.random().toString(36).substring(7);
        const newMessage = {
            id: tempId,
            channel_id: this.activeChannel.id,
            user_id: this.currentUser.username,
            author: this.currentUser.nickname,
            content: content,
            created_at: new Date().toISOString()
        };

        // 1. Optimistic Rendering: Display immediately
        input.value = '';
        input.style.height = 'auto';
        this.sentMessageCache.add(tempId); // Track by ID for precision
        this.queueMessage({ ...newMessage }, true);

        // 2. Broadcast: Instant Fast-track to others
        if (this.messageSubscription) {
            this.messageSubscription.send({
                type: 'broadcast',
                event: 'chat',
                payload: newMessage
            });
        }

        // 3. Persistent Storage
        const { data, error } = await this.supabase.from('anticode_messages').insert([{
            channel_id: this.activeChannel.id,
            user_id: this.currentUser.username,
            author: this.currentUser.nickname,
            content: content,
            image_url: newMessage.image_url || null
        }]).select('id, created_at').single();

        if (error) {
            console.error('Failed to send message:', error);
            // Revert optimistic state if needed
            return;
        }

        // ✅ Finalize immediately on insert success (don't wait for realtime)
        try {
            const opt = document.querySelector(`.message-item[data-optimistic="true"][data-temp-id="${tempId}"]`);
            if (opt) this.finalizeOptimistic(opt, String(data?.id || ''));
        } catch (_) { }
    }

    _fingerprintMessage(msg) {
        const safe = (v) => (v == null ? '' : String(v).trim());
        return [
            safe(msg.channel_id),
            safe(msg.user_id),
            safe(msg.author),
            safe(msg.content),
            safe(msg.image_url)
        ].join('|');
    }

    _isRecentDuplicate(msg, windowMs = 5000) {
        const key = this._fingerprintMessage(msg);
        const now = Date.now();
        const prev = this.recentMessageFingerprints.get(key);
        // prune old entries opportunistically
        for (const [k, t] of this.recentMessageFingerprints.entries()) {
            if (now - t > 30000) this.recentMessageFingerprints.delete(k);
        }
        if (prev && (now - prev) < windowMs) return true;
        this.recentMessageFingerprints.set(key, now);
        return false;
    }

    async appendMessage(msg, isOptimistic = false) {
        try {
            const container = document.getElementById('message-container');
            if (!container) return;

            // Message Deduplication & Optimistic Finalization
            if (!isOptimistic) {
                // Priority 1: Match by exact ID (Broadcast/Postgres)
                if (msg.id && this.processedMessageIds.has(msg.id)) return;

                // Priority 2: Finalize my own optimistic message
                const optimisticMsgs = container.querySelectorAll('.message-item[data-optimistic="true"]');
                for (let i = optimisticMsgs.length - 1; i >= 0; i--) {
                    const opt = optimisticMsgs[i];

                    // Match by temp ID if available
                    if (msg.id && opt.dataset.tempId === msg.id) {
                        this.finalizeOptimistic(opt, msg.id);
                        return;
                    }

                    // Fallback to content matching for Postgres events (where tempId is lost)
                    if (msg.user_id === this.currentUser.username) {
                        const textContentElement = opt.querySelector('.message-text');
                        const text = textContentElement?.innerText.trim();
                        if (text === (msg.content || '').trim()) {
                            this.finalizeOptimistic(opt, msg.id);
                            return;
                        }
                    }
                }

                if (msg.id) this.processedMessageIds.add(msg.id);
            }

            // Dedup Broadcast vs Postgres when IDs differ (other users)
            if (!isOptimistic && this._isRecentDuplicate(msg)) {
                if (msg.id) this.processedMessageIds.add(msg.id);
                return;
            }

            const msgEl = document.createElement('div');
            msgEl.className = 'message-item';
            if (isOptimistic) {
                msgEl.style.opacity = '0.7';
                msgEl.setAttribute('data-optimistic', 'true');
                if (msg.id) msgEl.dataset.tempId = msg.id; // Store tempId for matching
            }

            const timeStr = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const info = await this.getUserInfo(msg.user_id);
            const avatarHtml = `
            <div class="avatar-wrapper" style="width:32px; height:32px; position:relative; flex-shrink:0;">
                ${info.avatar_url ? `<img src="${info.avatar_url}" class="message-avatar" style="width:100%; height:100%; border-radius:50%;" onerror="this.onerror=null; this.src=''; this.style.display='none'; this.nextElementSibling.style.display='flex'">` : ''}
                <div class="user-avatar" style="width:100%; height:100%; display:${info.avatar_url ? 'none' : 'flex'}; align-items:center; justify-content:center; background:var(--accent-glow); color:var(--accent); border-radius:50%; font-weight:bold;">${msg.author[0]}</div>
            </div>
        `;

            const filtered = this.filterProfanity(msg.content || '');
            msgEl.innerHTML = `
                ${avatarHtml}
                <div class="message-content-wrapper">
                    <div class="message-meta">
                        <span class="member-name">${info.nickname}</span>
                        <span class="timestamp">${timeStr} <span class="sending-status">${isOptimistic ? '(전송 중...)' : ''}</span></span>
                    </div>
                    <div class="message-text">
                        ${this.linkify(this.escapeHtml(filtered.text))}
                        ${msg.image_url ? `<div class="message-image-content"><img src="${msg.image_url}" class="chat-img" onclick="window.open('${msg.image_url}')"></div>` : ''}
                    </div>
                </div>
            `;
            container.appendChild(msgEl);
            container.scrollTop = container.scrollHeight;
        } catch (e) {
            console.error('Failed to append message:', e, msg);
        }
    }

    finalizeOptimistic(opt, realId) {
        opt.style.opacity = '1';
        opt.removeAttribute('data-optimistic');
        const statusText = opt.querySelector('.sending-status');
        if (statusText) statusText.remove();
        if (realId) this.processedMessageIds.add(realId);
    }


    renderUserInfo() {
        const info = document.getElementById('current-user-info');
        if (!info) return;
        const avatarHtml = this.currentUser.avatar_url ? `<img src="${this.currentUser.avatar_url}" class="avatar-img">` : `<div class="user-avatar" style="width:32px; height:32px;">${this.currentUser.nickname[0]}</div>`;
        info.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                ${avatarHtml}
                <div class="user-info-text">
                    <div class="member-name" style="font-size:0.8rem;">${this.currentUser.nickname}</div>
                    <div class="uid-row" style="display:flex; align-items:center; gap:4px;">
                        <div class="uid-badge">UID: ${this.currentUser.uid}</div>
                        <button class="uid-copy-btn" title="UID 복사" data-uid="${this.currentUser.uid}">📋</button>
                    </div>
                </div>
            </div>
        `;

        const copyBtn = info.querySelector('.uid-copy-btn');
        if (copyBtn) {
            copyBtn.onclick = (e) => {
                e.stopPropagation();
                const uid = copyBtn.dataset.uid;
                navigator.clipboard.writeText(uid).then(() => {
                    const originalText = copyBtn.innerText;
                    copyBtn.innerText = '✅';
                    setTimeout(() => copyBtn.innerText = originalText, 1500);
                });
            };
        }
    }

    setupEventListeners() {
        const _safeBind = (id, event, fn) => {
            const el = typeof id === 'string' ? document.getElementById(id) : id;
            if (el) el[event] = fn;
        };
        const input = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-msg-btn');
        _safeBind('send-msg-btn', 'onclick', () => this.sendMessage());
        if (input) {
            input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); } };
            input.oninput = () => {
                input.style.height = 'auto';
                input.style.height = input.scrollHeight + 'px';
            };
        }

        // Profile Management
        _safeBind('current-user-info', 'onclick', () => {
            const nick = document.getElementById('edit-nickname');
            const av = document.getElementById('edit-avatar-url');
            if (nick) nick.value = this.currentUser.nickname;
            if (av) av.value = this.currentUser.avatar_url || '';
            const mod = document.getElementById('profile-modal');
            if (mod) mod.style.display = 'flex';
        });

        _safeBind('close-profile-modal', 'onclick', () => {
            const mod = document.getElementById('profile-modal');
            if (mod) mod.style.display = 'none';
        });
        document.getElementById('profile-form').onsubmit = async (e) => {
            e.preventDefault();
            const nickname = document.getElementById('edit-nickname').value;
            const avatarUrl = document.getElementById('edit-avatar-url').value;
            if (await this.updateProfile(nickname, avatarUrl)) {
                document.getElementById('profile-modal').style.display = 'none';
                location.reload(); // Refresh to update all instances
            }
        };

        // Emoji Picker
        const emojiBtn = document.getElementById('emoji-btn');
        const emojiPicker = document.getElementById('emoji-picker');
        emojiBtn.onclick = (e) => { e.stopPropagation(); emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'grid' : 'none'; };
        document.addEventListener('click', () => { emojiPicker.style.display = 'none'; });
        emojiPicker.querySelectorAll('.emoji-item').forEach(em => {
            em.onclick = (e) => {
                input.value += em.innerText;
                input.focus();
            };
        });

        // Mobile Toggles & Nav
        const sidebar = document.querySelector('.anticode-sidebar');
        const membersSide = document.querySelector('.anticode-members');
        const chatArea = document.querySelector('.anticode-chat-area');
        const dropdown = document.getElementById('mobile-dropdown-menu');

        const toggleSidebar = (open) => {
            if (sidebar) {
                if (typeof open === 'boolean') sidebar.classList.toggle('open', open);
                else sidebar.classList.toggle('open');
            }
            if (membersSide) membersSide.classList.remove('open');
            if (dropdown) dropdown.style.display = 'none';
        };
        const toggleMembers = (open) => {
            if (membersSide) {
                if (typeof open === 'boolean') membersSide.classList.toggle('open', open);
                else membersSide.classList.toggle('open');
            }
            if (sidebar) sidebar.classList.remove('open');
            if (dropdown) dropdown.style.display = 'none';
        };

        _safeBind('mobile-menu-toggle', 'onclick', (e) => { e.stopPropagation(); toggleSidebar(); });
        _safeBind('mobile-members-toggle', 'onclick', (e) => { e.stopPropagation(); toggleMembers(); });

        _safeBind('mobile-more-btn', 'onclick', (e) => {
            e.stopPropagation();
            if (dropdown) dropdown.style.display = dropdown.style.display === 'none' ? 'flex' : 'none';
        });

        _safeBind('menu-channels', 'onclick', (e) => { e.stopPropagation(); toggleSidebar(true); });
        _safeBind('menu-friends', 'onclick', (e) => { e.stopPropagation(); toggleSidebar(true); });
        _safeBind('menu-members', 'onclick', (e) => { e.stopPropagation(); toggleMembers(true); });
        const menuAdd = document.getElementById('menu-add');
        if (menuAdd) {
            if (this.isAdminMode) {
                menuAdd.onclick = (e) => {
                    e.stopPropagation();
                    if (dropdown) dropdown.style.display = 'none';
                    const m = document.getElementById('create-channel-modal');
                    if (m) m.style.display = 'flex';
                };
            } else {
                menuAdd.style.display = 'none';
            }
        }
        _safeBind('menu-profile', 'onclick', (e) => {
            e.stopPropagation();
            if (dropdown) dropdown.style.display = 'none';
            const mod = document.getElementById('profile-modal');
            if (mod) mod.style.display = 'flex';
        });

        document.addEventListener('click', () => {
            if (dropdown) dropdown.style.display = 'none';
        });

        if (chatArea) {
            chatArea.onclick = () => {
                if (sidebar) sidebar.classList.remove('open');
                if (membersSide) membersSide.classList.remove('open');
                if (dropdown) dropdown.style.display = 'none';
            };
        }
        // Channel Modal
        // Channel Modal
        const cModal = document.getElementById('create-channel-modal');
        const typeSelect = document.getElementById('new-channel-type');
        const passGroup = document.getElementById('password-field-group');
        const cForm = document.getElementById('create-channel-form');

        const openCreateBtn = document.getElementById('open-create-channel');
        if (openCreateBtn) {
            if (this.isAdminMode) {
                openCreateBtn.onclick = () => cModal && (cModal.style.display = 'flex');
            } else {
                openCreateBtn.style.display = 'none';
            }
        }
        _safeBind('close-channel-modal', 'onclick', () => cModal && (cModal.style.display = 'none'));
        if (typeSelect && passGroup) typeSelect.onchange = () => passGroup.style.display = typeSelect.value === 'secret' ? 'block' : 'none';
        if (cForm) {
            cForm.onsubmit = async (e) => {
                e.preventDefault();
                const success = await this.createChannel(document.getElementById('new-channel-name').value, typeSelect.value, document.getElementById('new-channel-category').value, document.getElementById('new-channel-password').value);
                if (success) { cModal.style.display = 'none'; cForm.reset(); }
            };
        }

        // Friend Modal
        const fModal = document.getElementById('add-friend-modal');
        const fForm = document.getElementById('add-friend-form');
        _safeBind('open-add-friend', 'onclick', () => fModal && (fModal.style.display = 'flex'));
        _safeBind('close-friend-modal', 'onclick', () => fModal && (fModal.style.display = 'none'));
        if (fForm) {
            fForm.onsubmit = async (e) => {
                e.preventDefault();
                if (await this.addFriendByUID(document.getElementById('friend-uid-input').value)) { fModal.style.display = 'none'; fForm.reset(); }
            };
        }

        // Friend List Modal (view all + invite)
        const friendModal = document.getElementById('friend-modal');
        _safeBind('close-friend-list-modal', 'onclick', () => friendModal && (friendModal.style.display = 'none'));

        // Settings Modal
        const sModal = document.getElementById('app-settings-modal');
        _safeBind('open-settings-btn', 'onclick', () => {
            if (sModal) {
                sModal.style.display = 'flex';
                this.updateButtons();
            }
            // Admin-only chat cleanup controls
            const cleanupGroup = document.getElementById('chat-cleanup-setting');
            if (cleanupGroup) cleanupGroup.style.display = this.isAdminMode ? 'flex' : 'none';
            if (this.isAdminMode) {
                const settings = this._loadCleanupSettings();
                const toggleBtn = document.getElementById('chat-cleanup-toggle');
                const lastRun = document.getElementById('chat-cleanup-last-run');
                if (toggleBtn) {
                    toggleBtn.classList.toggle('on', settings.enabled);
                    toggleBtn.textContent = settings.enabled ? '🔔 ON' : '🔕 OFF';
                }
                if (lastRun) lastRun.textContent = `마지막 실행: ${this._formatDateTime(this._getLastCleanupRunMs())}`;
            }
        });
        _safeBind('close-settings-modal', 'onclick', () => {
            if (sModal) sModal.style.display = 'none';
        });

        _safeBind('chat-cleanup-toggle', 'onclick', () => {
            if (!this.isAdminMode) return;
            const current = this._loadCleanupSettings().enabled;
            const next = !current;
            this._saveCleanupSettings(next);
            const btn = document.getElementById('chat-cleanup-toggle');
            if (btn) {
                btn.classList.toggle('on', next);
                btn.textContent = next ? '🔔 ON' : '🔕 OFF';
            }
        });

        _safeBind('chat-cleanup-run-now', 'onclick', async () => {
            if (!this.isAdminMode) return;
            if (!confirm('90일(3개월)보다 오래된 모든 채팅 메시지를 지금 삭제할까요?')) return;
            const btn = document.getElementById('chat-cleanup-run-now');
            const lastRun = document.getElementById('chat-cleanup-last-run');
            if (btn) { btn.disabled = true; btn.textContent = '실행 중...'; }
            try {
                const res = await this.cleanupOldMessages(90);
                if (!res.ok) alert('정리 실패: ' + (res.error?.message || res.error));
                else alert('정리 완료!');
            } catch (e) {
                alert('정리 실패: ' + (e?.message || e));
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = '지금 실행'; }
                if (lastRun) lastRun.textContent = `마지막 실행: ${this._formatDateTime(this._getLastCleanupRunMs())}`;
            }
        });

        // Password Entry
        const pModal = document.getElementById('password-entry-modal');
        const pForm = document.getElementById('password-entry-form');
        _safeBind('close-password-modal', 'onclick', () => pModal && (pModal.style.display = 'none'));
        if (pForm) {
            pForm.onsubmit = async (e) => {
                e.preventDefault();
                const channel = this.channels.find(c => c.id === this.pendingChannelId);
                if (channel && channel.password === document.getElementById('entry-password-input').value) {
                    pModal.style.display = 'none'; pForm.reset();
                    await this.switchChannel(this.pendingChannelId);
                } else alert('비밀번호가 틀렸습니다.');
            };
        }

        // --- NEW: Image Upload Handlers ---
        const chatFileInput = document.getElementById('chat-file-input');
        const attachBtn = document.getElementById('attach-btn');
        if (attachBtn && chatFileInput) {
            attachBtn.onclick = () => chatFileInput.click();
            chatFileInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const originalBtnText = attachBtn.textContent;
                attachBtn.textContent = '...';
                try {
                    const isImage = !!file.type && file.type.startsWith('image/');
                    // Very small limits for non-image attachments (as requested)
                    const maxBytes = isImage ? (5 * 1024 * 1024) : (file.name?.toLowerCase().endsWith('.zip') ? (1 * 1024 * 1024) : (200 * 1024));
                    if (file.size > maxBytes) {
                        alert(`파일 용량이 너무 큽니다.\\n- 이미지: 최대 5MB\\n- ZIP: 최대 1MB\\n- TXT: 최대 200KB`);
                        return;
                    }

                    const uploadFile = isImage ? await this.compressImageFile(file) : file;
                    const url = await this.uploadFile(uploadFile);

                    // Use same optimistic + finalize flow as text messages
                    const tempId = 'msg_' + Date.now() + Math.random().toString(36).substring(7);
                    const fileLabel = isImage ? '' : `📎 ${file.name}\\n${url}`;
                    const newMessage = {
                        id: tempId,
                        channel_id: this.activeChannel.id,
                        user_id: this.currentUser.username,
                        author: this.currentUser.nickname,
                        content: isImage ? '' : fileLabel,
                        image_url: isImage ? url : null,
                        created_at: new Date().toISOString()
                    };

                    this.sentMessageCache.add(tempId);
                    this.queueMessage({ ...newMessage }, true);

                    if (this.messageSubscription) {
                        this.messageSubscription.send({
                            type: 'broadcast',
                            event: 'chat',
                            payload: newMessage
                        });
                    }

                    const { data, error } = await this.supabase.from('anticode_messages').insert([{
                        channel_id: this.activeChannel.id,
                        user_id: this.currentUser.username,
                        author: this.currentUser.nickname,
                        content: isImage ? '' : fileLabel,
                        image_url: isImage ? url : null
                    }]).select('id, created_at').single();

                    if (error) {
                        console.error('Failed to send image message:', error);
                        return;
                    }

                    try {
                        const opt = document.querySelector(`.message-item[data-optimistic="true"][data-temp-id="${tempId}"]`);
                        if (opt) this.finalizeOptimistic(opt, String(data?.id || ''));
                    } catch (_) { }
                } catch (err) {
                    alert('이미지 업로드 실패: ' + err.message);
                } finally {
                    attachBtn.textContent = originalBtnText;
                    chatFileInput.value = '';
                }
            };
        }

        const avatarFileInput = document.getElementById('avatar-file-input');
        const uploadAvatarBtn = document.getElementById('upload-avatar-btn');
        if (uploadAvatarBtn && avatarFileInput) {
            uploadAvatarBtn.onclick = () => avatarFileInput.click();
            avatarFileInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                uploadAvatarBtn.textContent = '업로드 중...';
                try {
                    const optimized = await this.compressImageFile(file);
                    const url = await this.uploadFile(optimized);
                    document.getElementById('edit-avatar-url').value = url;
                    alert('프로필 이미지가 업로드되었습니다. 저장 버튼을 눌러 확정하세요.');
                } catch (err) {
                    alert('이미지 업로드 실패: ' + err.message);
                } finally {
                    uploadAvatarBtn.textContent = '파일 선택';
                    avatarFileInput.value = '';
                }
            };
        }
    }
}

const app = new AntiCodeApp();
window.app = app;
app.init();
