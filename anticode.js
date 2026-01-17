// [DEPLOYMENT] Cloudflare Pages Sync - 2026-01-03 10:35
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ==========================================
// 1. CONFIGURATION & GLOBALS
// ==========================================
const SUPABASE_URL = 'VITE_SUPABASE_URL';
const SUPABASE_KEY = 'VITE_SUPABASE_KEY';
const VAPID_PUBLIC_KEY = 'VITE_VAPID_PUBLIC_KEY';
const R2_UPLOAD_BASE_URL = 'VITE_R2_UPLOAD_BASE_URL';
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

// 🧵 Web Worker (Logic Thread) Manager
const LogicWorker = {
    worker: null,
    callbacks: new Map(),
    idCounter: 0,

    init() {
        if (this.worker) return;
        try {
            this.worker = new Worker('./worker.js');
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
            console.log('LogicWorker (Logic Thread) ready.');
        } catch (e) {
            console.warn('LogicWorker init failed:', e);
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
        this.is_public = data.is_public !== undefined ? data.is_public : true;
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
                <button id="copy-invite-link" class="icon-btn" title="초대 링크 복사" onclick="window.app.copyInviteLink()" style="margin-left: 12px; background: none; border: none; cursor: pointer; font-size: 1.2rem; filter: grayscale(1) opacity(0.6); transition: all 0.2s;" onmouseover="this.style.filter='none'; this.style.opacity='1'" onmouseout="this.style.filter='grayscale(1) opacity(0.6)'">🔗</button>
            </div>
        `;
    }

    renderSidebarItem(isActive, currentUsername, isAdmin, voiceState = { show: false, on: false }) {
        const hash = this.type === 'secret' ? '🔒' : '#';
        const categoryLabel = CATEGORY_NAMES[this.category] || '💬 채팅방';
        const isOwner = currentUsername && String(this.owner_id) === String(currentUsername);
        const canManage = isAdmin || isOwner;

        const deleteHtml = canManage ? `<button class="delete-channel-btn" data-id="${this.id}" onclick="event.stopPropagation(); window.app.deleteChannel('${this.id}')" title="채널 삭제">&times;</button>` : '';
        const editHtml = canManage ? `<button class="edit-channel-btn" data-id="${this.id}" onclick="event.stopPropagation(); window.app.editChannelPrompt('${this.id}')" title="채널 수정">✎</button>` : '';
        const voiceHtml = (voiceState && voiceState.show)
            ? `<span class="channel-voice-indicator ${voiceState.on ? 'on' : 'off'}" title="보이스 톡 ${voiceState.on ? 'ON' : 'OFF'}">${voiceState.on ? '🎙️' : '🎤'}</span>`
            : '';
        return `
            <div class="channel-group-item ${isActive ? 'active' : ''}">
                <div class="channel-name-row">
                    <div class="channel-name-label">${hash} ${this.name}</div>
                    <div class="channel-name-actions">
                        ${voiceHtml}
                        ${editHtml}
                    ${deleteHtml}
                    </div>
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
const SoundFX = {
    ctx: null,
    unlocked: false,

    ensure() {
        if (this.unlocked) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        try {
            this.ctx = new AC();
            // Resume best-effort (requires user gesture on most browsers)
            this.ctx.resume?.().catch(() => { });
            this.unlocked = true;
        } catch (_) {
            this.ctx = null;
            this.unlocked = false;
        }
    },

    _beep({ freq = 880, durationMs = 70, gain = 0.04, type = 'sine', delayMs = 0 } = {}) {
        if (!NotificationManager.isSoundOn) return;
        this.ensure();
        const ctx = this.ctx;
        if (!ctx || ctx.state !== 'running') return;
        const vol = Number(NotificationManager.volume ?? 0.8);
        const gainScaled = gain * (Number.isFinite(vol) ? Math.max(0, Math.min(1, vol)) : 0.8);
        const t0 = ctx.currentTime + (delayMs / 1000);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainScaled), t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + (durationMs / 1000));
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + (durationMs / 1000) + 0.02);
    },

    micOn() {
        // Upward double chirp
        this._beep({ freq: 880, durationMs: 55, gain: 0.05, type: 'triangle' });
        this._beep({ freq: 1320, durationMs: 55, gain: 0.05, type: 'triangle', delayMs: 70 });
    },

    micOff() {
        // Downward double chirp
        this._beep({ freq: 660, durationMs: 55, gain: 0.05, type: 'triangle' });
        this._beep({ freq: 440, durationMs: 65, gain: 0.05, type: 'triangle', delayMs: 70 });
    },

    notifFallback() {
        // Short "ping" when HTMLAudio is blocked (common on mobile until interaction)
        this._beep({ freq: 1046, durationMs: 60, gain: 0.04, type: 'sine' });
        this._beep({ freq: 1568, durationMs: 45, gain: 0.03, type: 'sine', delayMs: 65 });
    }
};

const NotificationManager = {
    count: 0,
    isSoundOn: localStorage.getItem('nano_notif_sound') !== 'off',
    volume: (() => {
        const raw = localStorage.getItem('nano_notif_volume');
        const n = raw == null ? 0.8 : Number(raw);
        return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.8;
    })(),
    initialized: false,

    async init() {
        if (this.initialized) this.cleanup(); // Clean up existing subs/timers before re-init
        this.updateBadge();
        this.updateButtons();
        this.applyVolume();
        this.updateOsPermissionButton();

        // Use a small delay to ensure supabase is ready
        this._subTimeout = setTimeout(() => this.setupSubscriptions(), 2000);

        this.initialized = true;
    },

    cleanup() {
        if (!this.initialized) return;
        if (this._subTimeout) clearTimeout(this._subTimeout);
        if (this._toastTimer) clearTimeout(this._toastTimer);

        if (window.app && window.app.supabase) {
            const supabase = window.app.supabase;
            supabase.removeChannel(supabase.channel('notif-posts-ac'));
            supabase.removeChannel(supabase.channel('notif-comments-ac'));
            supabase.removeChannel(supabase.channel('chat-notif-ac'));
        }
        this.initialized = false;
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
            })
            // [NEW] Real-time Invite listener
            .on('postgres_changes', { event: 'INSERT', table: 'anticode_channel_members' }, async (payload) => {
                // Check if this invite is for ME
                const me = window.app?.currentUser?.username;
                if (!me || payload.new.username !== me) return;

                console.log('Real-time invite received:', payload.new);

                // 1. Reload memberships to pick up the new channel
                await window.app.loadMyChannelMemberships();

                // 2. Render channels to show the new item
                window.app.renderChannels();

                // 3. Visual cue (blink/highlight new channel)
                const chId = payload.new.channel_id;
                setTimeout(() => {
                    // Try to find the element
                    // The element usually has an ID like `channel-item-${ch.id}` or we find it by data attribute
                    // In renderChannels, we don't strictly set IDs, so we might need to rely on the "blink" logic inside render or post-render check
                    // For now, let's play a notification sound
                    if (window.NotificationManager) window.NotificationManager.playSound();
                    window.app.showInAppToast?.(`새로운 채널에 초대되었습니다!`);
                }, 500);
            })
            .subscribe();
    },

    notify(type, data) {
        // Skip notifying myself for chat events
        try {
            const me = window.app?.currentUser?.username;
            if (type === 'chat' && me && (data?.user_id === me || data?.author === me)) return;
        } catch (_) { }

        // Increment count
        this.count++;
        if (this.count > 100) this.count = 100;

        this.updateBadge();
        this.playSound();

        const msg = this._formatMessage(type, data);
        this.showInAppToast(msg);

        // OS notification: show when tab is not active (background)
        try {
            if ((document.hidden || !document.hasFocus()) && this.isOsNotifEnabled()) {
                this.showOsNotification('Nanodoroshi / Anticode', {
                    body: msg,
                    tag: type === 'chat' ? `anticode_chat_${data?.channel_id || ''}` : `nano_${type}`,
                    renotify: false,
                    silent: false,
                    data: { kind: type, channel_id: data?.channel_id || null }
                });
            }
        } catch (_) { }
    },

    _formatMessage(type, data) {
        if (type === 'chat') {
            const author = data?.author || data?.user_id || '익명';
            const content = String(data?.content ?? '').slice(0, 140);
            return `[채팅] ${author}: ${content}`;
        }
        if (type === 'post') return `[새 글] ${data?.title || '새 게시글'}`;
        if (type === 'post-update') return `[글 수정] ${data?.title || '게시글 업데이트'}`;
        if (type === 'comment') return `[새 댓글] ${data?.content ? String(data.content).slice(0, 120) : '새 댓글'}`;
        if (type === 'comment-update') return `[댓글 수정] ${data?.content ? String(data.content).slice(0, 120) : '댓글 업데이트'}`;
        return `[알림] 새 이벤트`;
    },

    showInAppToast(text) {
        const el = document.getElementById('inapp-notif-toast');
        const body = document.getElementById('inapp-notif-toast-body');
        if (!el || !body) return;
        body.textContent = `${text}  ·  (이 소리는 Nanodoroshi/Anticode 웹앱에서 울립니다)`;
        el.style.display = 'block';
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => { try { el.style.display = 'none'; } catch (_) { } }, 3500);
    },

    playSound() {
        if (!this.isSoundOn) return;
        const audio = document.getElementById('notif-sound');
        if (audio) {
            audio.volume = this.volume;
            audio.currentTime = 0;
            const p = audio.play();
            if (p && typeof p.catch === 'function') {
                p.catch(e => {
                    console.warn('Sound play blocked by browser policy. Using fallback beep.', e);
                    SoundFX.notifFallback();
                });
            }
        }
    },

    applyVolume() {
        const audio = document.getElementById('notif-sound');
        if (audio) audio.volume = this.volume;
    },

    setVolume01(v) {
        const n = Number(v);
        this.volume = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.8;
        try { localStorage.setItem('nano_notif_volume', String(this.volume)); } catch (_) { }
        this.applyVolume();
    },

    isOsNotifEnabled() {
        // if sound notifications are disabled, also disable OS notifications for now
        // (user expectation: master toggle)
        return this.isSoundOn;
    },

    updateOsPermissionButton() {
        const btn = document.getElementById('notif-os-permission');
        if (!btn) return;
        const p = (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported';
        if (p === 'granted') { btn.textContent = 'OS 알림: 허용됨'; btn.classList.add('on'); }
        else if (p === 'denied') { btn.textContent = 'OS 알림: 차단됨'; btn.classList.remove('on'); }
        else if (p === 'default') { btn.textContent = 'OS 알림 허용'; btn.classList.remove('on'); }
        else { btn.textContent = 'OS 알림 미지원'; btn.classList.remove('on'); }
    },

    async requestOsPermission() {
        if (typeof Notification === 'undefined') return alert('이 브라우저는 OS 알림을 지원하지 않습니다.');
        try {
            const res = await Notification.requestPermission();
            this.updateOsPermissionButton();
            if (res !== 'granted') alert('OS 알림이 허용되지 않았습니다. 브라우저 설정에서 허용해 주세요.');
        } catch (e) {
            console.warn('requestPermission failed:', e);
            alert('OS 알림 권한 요청에 실패했습니다.');
        }
    },

    async showOsNotification(title, options) {
        if (typeof Notification === 'undefined') return;
        if (Notification.permission !== 'granted') return;
        // Prefer service worker notification (more consistent on mobile/PWA)
        try {
            const reg = await navigator.serviceWorker?.ready;
            if (reg?.showNotification) {
                await reg.showNotification(title, options);
                return;
            }
        } catch (_) { }
        try {
            // Fallback
            new Notification(title, options);
        } catch (_) { }
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
        this.updateOsPermissionButton();
    },

    updateButtons() {
        // Important: `.notif-toggle-btn` is also used as a general small button style.
        // Only update actual notification-sound toggle buttons.
        const btns = document.querySelectorAll('.notif-sound-toggle');
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

// Free-tier friendly limits (server + client)
const MESSAGE_RETENTION_PER_CHANNEL = 100; // Optimized: reduced from 300 to 100 for faster initial load
const FREE_VOICE_DAILY_SECONDS = 10 * 60;  // free tier voice time per day (seconds)
const FREE_MAX_PERSONAL_PAGES = 1;
const FREE_MAX_CHANNELS_PER_PAGE = 20;
const DEFAULT_CHANNEL_LIMIT_FREE = 10;
const DEFAULT_CHANNEL_LIMIT_PRO = 50; // free(10) + 40 (hard cap for stability)

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
        this.channelMemberMeta = new Map(); // username -> { invited_by }
        this.channelBlockedUsernames = new Set(); // usernames blocked by me in active channel (invite/kick control)
        // Room participants (ever chatted in this room). Loaded per-channel for offline list UI.
        this.channelParticipants = []; // [{ username, last_message_at }]
        this.messageQueue = [];
        this.isProcessingQueue = false;
        // Voice chat
        this.voiceEnabled = false;
        this.localAudioStream = null;
        this.voiceChannel = null; // Supabase broadcast channel for WebRTC signaling (per room)
        this.peerConnections = new Map(); // username -> RTCPeerConnection
        this.remoteAudioEls = new Map(); // username -> HTMLAudioElement
        this.voiceDeviceId = null; // preferred microphone deviceId (per user)
        this.micGain = 1.3; // 1.0 -> 1.3 (Default volume boost)
        // Shared mic pipeline (used by voice + mic test)
        this._micUsers = { voice: false, test: false };
        this._micDeviceIdInUse = null;
        this._micRawStream = null;
        this._micAudioCtx = null;
        this._micSource = null;
        this._micAnalyser = null;
        this._micCompressor = null;
        this._micGainNode = null;
        this._micDest = null; // MediaStreamDestination
        this._micMonitorConnected = false; // whether gain is connected to speakers
        this._micMeterRaf = null;
        // Push (Web Push)
        this.pushEnabled = false;

        // Plan / gating (free vs pro)
        this.planTier = 'free'; // resolved after syncUserMetadata()

        // Hidden Open Chat
        this.myJoinedChannelIds = new Set(); // Channels I have been invited to/joined

        // Free tier voice usage (local enforcement)
        this._voiceLimitTimer = null;
        this._voiceSessionStartedAtMs = 0;
        this._voiceSessionDayKey = '';

        // Per-user channel pages (custom channel list / directory)
        this.channelPages = []; // [{id, username, name}]
        this.channelPageItems = new Map(); // pageId -> [{channel_id, position}]
        this.activeChannelPageId = 'all';
        this._friendModalTargetChannelId = null; // optional invite target from directory/pages

        // Bind critical methods to ensure 'this' context in obfuscated environments
        this.appendMessage = this.appendMessage.bind(this);
        this.createMessageElementAsync = this.createMessageElementAsync.bind(this);
        this.finalizeOptimistic = this.finalizeOptimistic.bind(this);
        this.getUserInfo = this.getUserInfo.bind(this);
        this._scrollToBottom = this._scrollToBottom.bind(this);
    }

    async refreshEntitlements() {
        // Server-truth plan source: public.app_entitlements (updated by RevenueCat webhook)
        if (!this.supabase || !this.currentUser?.username) return;
        try {
            const { data, error } = await this.supabase
                .from('app_entitlements')
                .select('is_active, period_ends_at')
                .eq('user_id', this.currentUser.username)
                .eq('entitlement', 'pro')
                .limit(1);
            if (error) throw error;
            const row = (data && data[0]) ? data[0] : null;
            const active = !!row?.is_active && (!row?.period_ends_at || new Date(row.period_ends_at).getTime() > Date.now());
            this.currentUser.plan = active ? 'pro' : 'free';
            this._refreshPlanTier();
        } catch (_) {
            // keep existing planTier (local override/admin fallback)
        }
    }

    _localDayKey() {
        // Local date key (YYYY-MM-DD) so "daily limit" matches user expectation.
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    _voiceUsageStorageKey() {
        const u = this.currentUser?.username || 'anonymous';
        const day = this._localDayKey();
        return `anticode_voice_used_seconds::${u}::${day}`;
    }

    _getFreeVoiceUsedSeconds() {
        try {
            const raw = localStorage.getItem(this._voiceUsageStorageKey());
            const n = Number(raw);
            return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
        } catch (_) {
            return 0;
        }
    }

    _setFreeVoiceUsedSeconds(n) {
        try {
            localStorage.setItem(this._voiceUsageStorageKey(), String(Math.max(0, Math.floor(n))));
        } catch (_) { }
    }

    _getFreeVoiceRemainingSeconds() {
        const used = this._getFreeVoiceUsedSeconds();
        return Math.max(0, FREE_VOICE_DAILY_SECONDS - used);
    }

    _refreshPlanTier() {
        // Temporary, payment-less plan switch:
        // - localStorage override for testing: anticode_plan_override = "free" | "pro"
        // - admins treated as pro by default
        try {
            const o = (localStorage.getItem('anticode_plan_override') || '').toLowerCase();
            if (o === 'free' || o === 'pro') {
                this.planTier = o;
                return;
            }
        } catch (_) { }

        const plan = (this.currentUser?.plan || '').toLowerCase();
        if (plan === 'pro') this.planTier = 'pro';
        else if (this.currentUser?.role === 'admin') this.planTier = 'pro';
        else this.planTier = 'free';
    }

    _isProUser() {
        return this.planTier === 'pro';
    }

    _isAdmin() {
        return String(this.currentUser?.role || '') === 'admin';
    }

    async loadMyChannelMemberships() {
        if (!this.supabase || !this.currentUser?.username) return;
        try {
            const { data, error } = await this.supabase
                .from('anticode_channel_members')
                .select('channel_id')
                .eq('username', this.currentUser.username);

            if (!error && data) {
                this.myJoinedChannelIds = new Set(data.map(r => String(r.channel_id)));
            }
        } catch (e) {
            console.warn('loadMyChannelMemberships failed:', e);
        }
    }

    _canCreateMorePersonalPages() {
        if (this._isAdmin() || this._isProUser()) return true;
        return (this.channelPages?.length || 0) < FREE_MAX_PERSONAL_PAGES;
    }

    _canAddMoreChannelsToPage(pageId) {
        if (this._isAdmin() || this._isProUser()) return true;
        const pid = String(pageId || '');
        const items = this.channelPageItems.get(pid) || [];
        return items.length < FREE_MAX_CHANNELS_PER_PAGE;
    }

    canUploadImages() {
        return true;
    }

    _truncateName(name, maxChars = 8) {
        const full = String(name || '').trim();
        if (!full) return { full: '', short: '' };
        const short = (full.length > maxChars) ? (full.slice(0, maxChars) + '…') : full;
        return { full, short };
    }

    _getActiveChannelPageKey() {
        const u = this.currentUser?.username || 'anonymous';
        return `anticode_active_channel_page::${u}`;
    }

    _loadActiveChannelPageId() {
        try {
            const raw = localStorage.getItem(this._getActiveChannelPageKey());
            this.activeChannelPageId = raw ? String(raw) : 'all';
        } catch (_) {
            this.activeChannelPageId = 'all';
        }
    }

    _setActiveChannelPageId(pageId) {
        const v = pageId ? String(pageId) : 'all';
        this.activeChannelPageId = v;
        try { localStorage.setItem(this._getActiveChannelPageKey(), v); } catch (_) { }
        this.renderChannels();
        // Update UI visibility for creation buttons when page changes
        if (this._updateCreateBtnVisibility) this._updateCreateBtnVisibility();
        if (this._updateMenuAddVisibility) this._updateMenuAddVisibility();
    }

    async loadChannelPages() {
        if (!this.supabase || !this.currentUser?.username) return;
        const { data, error } = await this.supabase
            .from('anticode_channel_pages')
            .select('*')
            .eq('username', this.currentUser.username)
            .order('created_at', { ascending: true });
        if (error) {
            console.warn('loadChannelPages failed:', error);
            this.channelPages = [];
            this.channelPageItems = new Map();
            return;
        }
        this.channelPages = data || [];
        const ids = this.channelPages.map(p => p.id);
        this.channelPageItems = new Map();
        if (ids.length === 0) return;
        const { data: items, error: e2 } = await this.supabase
            .from('anticode_channel_page_items')
            .select('page_id, channel_id, position')
            .in('page_id', ids)
            .order('position', { ascending: true });
        if (e2) {
            console.warn('loadChannelPageItems failed:', e2);
            return;
        }
        for (const it of (items || [])) {
            if (!this.channelPageItems.has(it.page_id)) this.channelPageItems.set(it.page_id, []);
            this.channelPageItems.get(it.page_id).push(it);
        }
    }

    _pageNameById(pageId) {
        if (!pageId || pageId === 'all') return '전체 채널';
        return this.channelPages.find(p => p.id === pageId)?.name || '내 페이지';
    }

    _getVisibleChannelsByActivePage() {
        // Filter channels for sidebar based on selected page
        // [MOD] Also filter out hidden open chats if not owner/invited
        const me = this.currentUser?.username;
        const visibleChannels = this.channels.filter(ch => {
            if (ch.type === 'open_hidden') {
                if (!me) return false;
                const isOwner = String(ch.owner_id) === String(me);
                // "myJoinedChannelIds" tracks channels I am a member of (invited/joined)
                return isOwner || this.myJoinedChannelIds.has(String(ch.id));
            }
            return true;
        });

        if (this.activeChannelPageId === 'all') {
            return visibleChannels.filter(ch => ch.is_public === true);
        }
        const items = this.channelPageItems.get(this.activeChannelPageId) || [];
        const order = new Map(items.map((it, idx) => [String(it.channel_id), Number(it.position ?? idx)]));
        const filtered = visibleChannels
            .filter(ch => order.has(String(ch.id)))
            .sort((a, b) => (order.get(String(a.id)) ?? 0) - (order.get(String(b.id)) ?? 0));
        return filtered;
    }

    renderChannelPageSelector() {
        const sel = document.getElementById('channel-page-select');
        if (!sel) return;
        const current = String(this.activeChannelPageId || 'all');
        sel.innerHTML = '';
        const optAll = document.createElement('option');
        optAll.value = 'all';
        optAll.textContent = '전체 채널';
        sel.appendChild(optAll);
        (this.channelPages || []).forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            sel.appendChild(opt);
        });
        sel.value = current;
        if (!sel.value) sel.value = 'all';
        sel.onchange = () => this._setActiveChannelPageId(sel.value);
    }

    async createChannelPage(name) {
        const n = String(name || '').trim();
        if (!n) return false;
        if (!this._canCreateMorePersonalPages()) {
            alert(`무료 플랜은 개인 페이지를 최대 ${FREE_MAX_PERSONAL_PAGES}개까지 만들 수 있습니다.`);
            return false;
        }
        const { error } = await this.supabase.from('anticode_channel_pages').insert([{
            username: this.currentUser.username,
            name: n
        }]);
        if (error) { alert('페이지 생성 실패: ' + error.message); return false; }
        await this.loadChannelPages();
        this.renderChannelPageSelector();
        return true;
    }

    async deleteChannelPage(pageId) {
        const id = String(pageId || '');
        if (!id || id === 'all') return false;
        const { error } = await this.supabase.from('anticode_channel_pages').delete().eq('id', id).eq('username', this.currentUser.username);
        if (error) { alert('페이지 삭제 실패: ' + error.message); return false; }
        if (this.activeChannelPageId === id) this._setActiveChannelPageId('all');
        await this.loadChannelPages();
        this.renderChannelPageSelector();
        return true;
    }

    async addChannelToPage(pageId, channelId) {
        const pid = String(pageId || '');
        const cid = String(channelId || '');
        if (!pid || pid === 'all' || !cid) return false;
        if (!this._canAddMoreChannelsToPage(pid)) {
            alert(`무료 플랜은 페이지당 채널을 최대 ${FREE_MAX_CHANNELS_PER_PAGE}개까지 추가할 수 있습니다.`);
            return false;
        }
        const items = this.channelPageItems.get(pid) || [];
        const maxPos = items.reduce((m, it) => Math.max(m, Number(it.position || 0)), 0);
        const { error } = await this.supabase.from('anticode_channel_page_items').upsert([{
            page_id: pid,
            channel_id: cid,
            position: maxPos + 1
        }], { onConflict: 'page_id,channel_id' });
        if (error) { alert('채널 추가 실패: ' + error.message); return false; }
        await this.loadChannelPages();
        this.renderChannels();
        return true;
    }

    async removeChannelFromPage(pageId, channelId) {
        const pid = String(pageId || '');
        const cid = String(channelId || '');
        if (!pid || pid === 'all' || !cid) return false;
        const { error } = await this.supabase.from('anticode_channel_page_items').delete().eq('page_id', pid).eq('channel_id', cid);
        if (error) { alert('채널 제거 실패: ' + error.message); return false; }
        await this.loadChannelPages();
        this.renderChannels();
        return true;
    }

    openChannelPagesModal() {
        const m = document.getElementById('channel-pages-modal');
        if (!m) return;
        m.style.display = 'flex';
        this._ensureChannelPagesModalBindings();
        this.renderChannelPagesModal();
    }

    closeChannelPagesModal() {
        const m = document.getElementById('channel-pages-modal');
        if (!m) return;
        m.style.display = 'none';
    }

    _channelLabel(ch) {
        if (!ch) return '';
        const cat = CATEGORY_NAMES[ch.category] || ('#' + (ch.category || 'chat'));
        const type = ch.type || 'general';
        return `${cat} · ${type}`;
    }

    async renameChannelPage(pageId, newName) {
        const pid = String(pageId || '');
        const n = String(newName || '').trim();
        if (!pid || pid === 'all') return false;
        if (!n) return false;
        const { error } = await this.supabase
            .from('anticode_channel_pages')
            .update({ name: n })
            .eq('id', pid)
            .eq('username', this.currentUser.username);
        if (error) { alert('이름 변경 실패: ' + error.message); return false; }
        await this.loadChannelPages();
        this.renderChannelPageSelector();
        return true;
    }

    async _persistPersonalPageOrderFromDom(pageId, itemsBoxEl) {
        const pid = String(pageId || '');
        if (!pid || pid === 'all') return;
        if (!itemsBoxEl) return;
        const ids = Array.from(itemsBoxEl.querySelectorAll('.draggable-item'))
            .map(el => String(el.getAttribute('data-cid') || ''))
            .filter(Boolean);
        if (ids.length === 0) return;

        // Batch update positions (best-effort)
        try {
            const updates = ids.map((cid, idx) => ({ page_id: pid, channel_id: cid, position: idx }));
            const { error } = await this.supabase
                .from('anticode_channel_page_items')
                .upsert(updates, { onConflict: 'page_id,channel_id' });
            if (error) console.warn('persist order failed:', error);
            await this.loadChannelPages();
            this.renderChannels();
        } catch (e) {
            console.warn('persist order exception:', e);
        }
    }

    renderChannelPagesModal() {
        const sel = document.getElementById('pages-modal-select');
        const itemsBox = document.getElementById('pages-modal-items');
        const resultsBox = document.getElementById('pages-modal-results');
        const search = document.getElementById('pages-modal-search');
        if (!sel || !itemsBox || !resultsBox || !search) return;

        // Render selector options without re-binding events (bindings happen once)
        const current = String(this.activeChannelPageId || 'all');
        const existingKey = sel.getAttribute('data-options-key') || '';
        const newKey = JSON.stringify((this.channelPages || []).map(p => [p.id, p.name]));
        if (existingKey !== newKey) {
            sel.setAttribute('data-options-key', newKey);
            sel.innerHTML = '';
            const optAll = document.createElement('option');
            optAll.value = 'all';
            optAll.textContent = '전체 채널(편집 불가)';
            sel.appendChild(optAll);
            (this.channelPages || []).forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                sel.appendChild(opt);
            });
        }
        sel.value = current;
        if (!sel.value) sel.value = 'all';

        // Partial refresh only
        this._refreshPersonalPageItems();
        this._refreshPersonalSearchResults(true);
    }

    _ensureChannelPagesModalBindings() {
        if (this._channelPagesModalBound) return;
        this._channelPagesModalBound = true;

        const sel = document.getElementById('pages-modal-select');
        const search = document.getElementById('pages-modal-search');
        const itemsBox = document.getElementById('pages-modal-items');

        if (sel) {
            sel.addEventListener('change', () => {
                this.activeChannelPageId = String(sel.value || 'all');
                this._refreshPersonalPageItems();
                this._refreshPersonalSearchResults(true);
            });
        }

        if (search) {
            search.addEventListener('input', () => {
                if (this._pagesSearchT) clearTimeout(this._pagesSearchT);
                this._pagesSearchT = setTimeout(() => this._refreshPersonalSearchResults(false), 120);
            });
        }

        // Drag & drop delegation (single set of listeners)
        if (itemsBox) {
            itemsBox.addEventListener('dragstart', (e) => {
                const el = e.target?.closest?.('.draggable-item');
                if (!el) return;
                el.classList.add('dragging');
                try {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', el.getAttribute('data-cid') || '');
                } catch (_) { }
            });
            itemsBox.addEventListener('dragend', async (e) => {
                const el = e.target?.closest?.('.draggable-item');
                if (!el) return;
                el.classList.remove('dragging');
                const pid = String(document.getElementById('pages-modal-select')?.value || 'all');
                await this._persistPersonalPageOrderFromDom(pid, itemsBox);
            });
            itemsBox.addEventListener('dragover', (e) => {
                e.preventDefault();
                const dragging = itemsBox.querySelector('.draggable-item.dragging');
                if (!dragging) return;
                const after = Array.from(itemsBox.querySelectorAll('.draggable-item:not(.dragging)'))
                    .find(node => {
                        const box = node.getBoundingClientRect();
                        return e.clientY < box.top + box.height / 2;
                    });
                if (after) itemsBox.insertBefore(dragging, after);
                else itemsBox.appendChild(dragging);
            });
        }
    }

    _refreshPersonalPageItems() {
        const sel = document.getElementById('pages-modal-select');
        const itemsBox = document.getElementById('pages-modal-items');
        if (!sel || !itemsBox) return;
        const pid = String(sel.value || 'all');

        if (pid === 'all') {
            itemsBox.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem;">'전체 채널'은 편집할 수 없습니다. 새 페이지를 만든 뒤 채널을 추가하세요.</div>`;
            return;
        }

        const its = (this.channelPageItems.get(pid) || []).slice();
        const idSet = new Set(its.map(it => String(it.channel_id)));
        const chans = this.channels.filter(c => idSet.has(String(c.id)));
        const order = new Map(its.map((it, idx) => [String(it.channel_id), Number(it.position ?? idx)]));
        chans.sort((a, b) => (order.get(String(a.id)) ?? 0) - (order.get(String(b.id)) ?? 0));

        if (chans.length === 0) {
            itemsBox.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem;">이 페이지에 채널이 없습니다.</div>`;
            return;
        }

        itemsBox.innerHTML = chans.map((ch) => {
            const label = this._channelLabel(ch);
            return `
              <div class="member-card draggable-item" data-pid="${pid}" data-cid="${ch.id}" style="margin-bottom:8px;">
                <div class="member-info" style="cursor:pointer;" 
                     onclick="if(window.app) { window.app.handleChannelSwitch('${ch.id}'); document.getElementById('channel-pages-modal').style.display='none'; }">
                  <span class="member-name-text" title="${this.escapeHtml(ch.name)}"><span style="color:var(--accent); margin-right:4px;">#</span>${this.escapeHtml(this._truncateName(ch.name, 18).short)}</span>
                  <span class="member-status-sub">${this.escapeHtml(label)}</span>
                </div>
                <div class="member-actions">
                  <button class="notif-toggle-btn" style="white-space:nowrap;" onclick="if(window.app) { window.app.handleChannelSwitch('${ch.id}'); document.getElementById('channel-pages-modal').style.display='none'; }">이동</button>
                  <button class="notif-toggle-btn" style="white-space:nowrap;" onclick="window.app && window.app.removeChannelFromPage && window.app.removeChannelFromPage('${pid}','${ch.id}')">제거</button>
                  <button class="notif-toggle-btn on" style="white-space:nowrap;" onclick="window.app && window.app.openFriendModalForChannel && window.app.openFriendModalForChannel('${ch.id}')">초대</button>
                </div>
              </div>
            `;
        }).join('');
    }

    _refreshPersonalSearchResults(force = false) {
        const sel = document.getElementById('pages-modal-select');
        const resultsBox = document.getElementById('pages-modal-results');
        const search = document.getElementById('pages-modal-search');
        if (!sel || !resultsBox || !search) return;
        const pid = String(sel.value || 'all');
        const q = String(search.value || '').trim().toLowerCase();

        // If not forced and query is empty, keep existing results to avoid needless churn
        if (!force && !q) return;

        const base = this.channels.slice();
        const filtered = q
            ? base.filter(ch => {
                if (ch.type === 'open_hidden') {
                    const me = this.currentUser?.username;
                    if (!me) return false;
                    const isOwner = String(ch.owner_id) === String(me);
                    // "myJoinedChannelIds" tracks channels I am a member of (invited/joined)
                    if (!isOwner && !this.myJoinedChannelIds.has(String(ch.id))) return false;
                }
                return (ch.name || '').toLowerCase().includes(q) ||
                    (ch.category || '').toLowerCase().includes(q) ||
                    (ch.type || '').toLowerCase().includes(q) ||
                    (ch.owner_id || '').toLowerCase().includes(q);
            })
            : base.filter(ch => {
                if (ch.type === 'open_hidden') {
                    const me = this.currentUser?.username;
                    if (!me) return false;
                    const isOwner = String(ch.owner_id) === String(me);
                    if (!isOwner && !this.myJoinedChannelIds.has(String(ch.id))) return false;
                }
                return true;
            });

        const combinedResults = [
            ...limited.map(ch => ({ type: 'channel', data: ch })),
        ];

        // Perform async global page search if query is long enough
        if (q && q.length >= 2) {
            this.searchGlobalPages(q).then(pages => {
                if (!pages || pages.length === 0) {
                    this._renderDiscoveryResults(combinedResults, resultsBox, pid);
                    return;
                }
                const pageResults = pages.map(p => ({ type: 'page', data: p }));
                // Re-render with pages at the top
                this._renderDiscoveryResults([...pageResults, ...combinedResults], resultsBox, pid);
            });
        }

        this._renderDiscoveryResults(combinedResults, resultsBox, pid);
    }

    async searchGlobalPages(q) {
        if (!this.supabase || !q) return [];
        try {
            const { data, error } = await this.supabase
                .from('anticode_channel_pages')
                .select('id, name, username')
                .or(`name.ilike.%${q}%,username.ilike.%${q}%`)
                .limit(10);
            return data || [];
        } catch (_) { return []; }
    }

    _renderDiscoveryResults(items, container, pid) {
        if (!container) return;
        if (items.length === 0) {
            container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem;">검색 결과 없음</div>`;
            return;
        }

        container.innerHTML = items.map(item => {
            if (item.type === 'channel') {
                const ch = item.data;
                const label = this._channelLabel(ch);
                const canAdd = pid !== 'all';
                const ownerInfo = ch.owner_id ? `<span style="font-size:0.7rem; opacity:0.6;"> (by ${ch.owner_id})</span>` : '';
                return `
                  <div class="member-card" style="margin-bottom:8px;">
                    <div class="member-info" style="cursor:pointer;" 
                         onclick="if(window.app) { window.app.handleChannelSwitch('${ch.id}'); document.getElementById('channel-pages-modal').style.display='none'; }">
                      <span class="member-name-text" title="${this.escapeHtml(ch.name)}">
                        <span style="color:var(--accent); margin-right:4px;">#</span>${this.escapeHtml(this._truncateName(ch.name, 18).short)}${this.escapeHtml(ownerInfo)}
                      </span>
                      <span class="member-status-sub">[채널] ${this.escapeHtml(label)}</span>
                    </div>
                    <div class="member-actions">
                      <button class="notif-toggle-btn" style="white-space:nowrap;" onclick="if(window.app) { window.app.handleChannelSwitch('${ch.id}'); document.getElementById('channel-pages-modal').style.display='none'; }">이동</button>
                      ${canAdd ? `<button class="notif-toggle-btn" style="white-space:nowrap;" onclick="window.app && window.app.addChannelToPage && window.app.addChannelToPage('${pid}','${ch.id}')">추가</button>` : ''}
                      <button class="notif-toggle-btn on" style="white-space:nowrap;" onclick="window.app && window.app.openFriendModalForChannel && window.app.openFriendModalForChannel('${ch.id}')">초대</button>
                    </div>
                  </div>
                `;
            } else {
                const p = item.data;
                return `
                  <div class="member-card" style="margin-bottom:8px;">
                    <div class="member-info" style="cursor:default;">
                      <span class="member-name-text" title="${this.escapeHtml(p.name)}">
                        <span style="color:var(--futuristic-accent); margin-right:4px;">📂</span>${this.escapeHtml(p.name)}
                      </span>
                      <span class="member-status-sub">[페이지] 소유자: ${this.escapeHtml(p.username)}</span>
                    </div>
                    <div class="member-actions">
                       <button class="notif-toggle-btn on" style="white-space:nowrap;" onclick="window.app && window.app.loadGlobalPageIntoCurrentView && window.app.loadGlobalPageIntoCurrentView('${p.id}')">보기</button>
                    </div>
                  </div>
                `;
            }
        }).join('');
    }

    async loadGlobalPageIntoCurrentView(pageId) {
        // Feature: temporarily list channels in this page so user can add them
        try {
            const { data: items, error } = await this.supabase
                .from('anticode_channel_page_items')
                .select('channel_id')
                .eq('page_id', pageId);
            if (error || !items) return alert('페이지 로드 실패');

            const cids = new Set(items.map(it => String(it.channel_id)));
            const resultsBox = document.getElementById('pages-modal-results');
            if (!resultsBox) return;

            const filtered = this.channels.filter(ch => cids.has(String(ch.id)));
            const pageObj = await this.supabase.from('anticode_channel_pages').select('name').eq('id', pageId).single();
            const pageName = pageObj.data?.name || "선택된 페이지";

            resultsBox.innerHTML = `
                <div style="padding: 8px; border-bottom: 1px solid var(--border); margin-bottom: 8px; font-weight: bold; color: var(--accent);">
                    📂 ${pageName} 의 채널들
                </div>
                ${filtered.map(ch => {
                const label = this._channelLabel(ch);
                const pid = document.getElementById('pages-modal-select')?.value || 'all';
                const canAdd = pid !== 'all';
                return `
                        <div class="member-card" style="margin-bottom:8px;">
                            <div class="member-info" style="cursor:pointer;" onclick="if(window.app) { window.app.handleChannelSwitch('${ch.id}'); document.getElementById('channel-pages-modal').style.display='none'; }">
                                <span class="member-name-text">#${this.escapeHtml(ch.name)}</span>
                                <span class="member-status-sub">${this.escapeHtml(label)}</span>
                            </div>
                            <div class="member-actions">
                                 ${canAdd ? `<button class="notif-toggle-btn" style="white-space:nowrap;" onclick="window.app.addChannelToPage('${pid}','${ch.id}')">추가</button>` : ''}
                            </div>
                        </div>
                    `;
            }).join('')}
                <button class="notif-toggle-btn" style="width:100%; margin-top:10px;" onclick="window.app._refreshPersonalSearchResults(true)">검색 목록으로 돌아가기</button>
            `;

        } catch (e) { alert('오류 발생'); }
    }

    openFriendModalForChannel(channelId) {
        this._friendModalTargetChannelId = channelId ? String(channelId) : null;
        this.openFriendModal();
    }

    async inviteFriendToChannel(channelId, friendUsername) {
        const chId = String(channelId || '');
        if (!chId) return alert('채널을 선택하세요.');
        if (!friendUsername) return;

        const isFriend = this.friends?.some(f => f.username === friendUsername);
        if (!isFriend) return alert('친구만 초대할 수 있습니다.');

        // Block check (per-channel)
        try {
            const { data } = await this.supabase
                .from('anticode_channel_blocks')
                .select('id')
                .eq('channel_id', chId)
                .eq('blocked_username', friendUsername)
                .eq('blocked_by', this.currentUser.username)
                .limit(1);
            if (data && data.length > 0) {
                alert('이 유저는 해당 채널에서 차단되어 있습니다.\n차단해제 후 초대할 수 있습니다.');
                return;
            }
        } catch (_) { }

        const payload = {
            channel_id: chId,
            username: friendUsername,
            invited_by: this.currentUser.username,
            created_at: new Date().toISOString()
        };
        const { error } = await this.supabase
            .from('anticode_channel_members')
            .upsert([payload], { onConflict: 'channel_id,username' });
        if (error) {
            console.error('Invite error:', error);
            alert('초대 실패: ' + error.message + '\n\n(필요 테이블: anticode_channel_members)');
            return;
        }
        // If inviting to current channel, refresh UI
        if (this.activeChannel?.id && String(this.activeChannel.id) === chId) {
            await this.loadChannelMembers(this.activeChannel.id);
            try { await this.updateChannelMemberPanel(this.channelPresenceChannel?.presenceState?.() || {}); } catch (_) { }
        }
        alert('초대 완료!');
    }

    _clearVoiceLimitTimer() {
        if (this._voiceLimitTimer) {
            try { clearTimeout(this._voiceLimitTimer); } catch (_) { }
            this._voiceLimitTimer = null;
        }
        this._voiceSessionStartedAtMs = 0;
        this._voiceSessionDayKey = '';
    }

    _startFreeVoiceLimitTimer() {
        if (this._isProUser()) return true;

        const remaining = this._getFreeVoiceRemainingSeconds();
        if (remaining <= 0) return false;

        this._clearVoiceLimitTimer();
        this._voiceSessionStartedAtMs = Date.now();
        this._voiceSessionDayKey = this._localDayKey();

        this._voiceLimitTimer = setTimeout(async () => {
            try { await this.stopVoice({ playFx: true }); } catch (_) { }
            alert('무료 보이스 사용 시간(하루 10분)을 모두 사용했습니다.\\n계속 사용하려면 유료 플랜 가입이 필요합니다.');
        }, remaining * 1000);

        return true;
    }

    _finalizeFreeVoiceUsage() {
        if (this._isProUser()) return;
        if (!this._voiceSessionStartedAtMs) return;

        // If day changed mid-call, we conservatively count usage against the start day.
        const elapsedSec = Math.max(0, Math.floor((Date.now() - this._voiceSessionStartedAtMs) / 1000));
        if (elapsedSec <= 0) return;

        try {
            // Ensure key is stable for the session day
            const u = this.currentUser?.username || 'anonymous';
            const day = this._voiceSessionDayKey || this._localDayKey();
            const key = `anticode_voice_used_seconds::${u}::${day}`;
            const prev = Number(localStorage.getItem(key) || '0');
            const next = (Number.isFinite(prev) ? prev : 0) + elapsedSec;
            localStorage.setItem(key, String(next));
        } catch (_) { }
    }

    _base64UrlToUint8Array(base64Url) {
        const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
        const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(base64);
        const output = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
        return output;
    }

    _pushSupported() {
        return !!(window.Notification && navigator.serviceWorker && window.PushManager);
    }

    async _getSwRegistration() {
        if (!('serviceWorker' in navigator)) throw new Error('Service Worker 미지원');
        let reg = await navigator.serviceWorker.getRegistration();
        if (!reg) reg = await navigator.serviceWorker.register('./sw.js');
        return reg;
    }

    _setPushStatus(text) {
        const el = document.getElementById('push-status');
        if (el) el.textContent = `상태: ${text}`;
    }

    async refreshPushStatus() {
        if (!this._pushSupported()) {
            this._setPushStatus('이 브라우저는 푸시를 지원하지 않음');
            return;
        }
        const perm = Notification.permission;
        if (perm !== 'granted') {
            this._setPushStatus(`권한 필요 (${perm})`);
            return;
        }
        try {
            const reg = await this._getSwRegistration();
            const sub = await reg.pushManager.getSubscription();
            this.pushEnabled = !!sub;
            this._setPushStatus(sub ? '켜짐' : '꺼짐');
        } catch (e) {
            this._setPushStatus('오류: ' + (e?.message || e));
        }
    }

    _subToRow(subscription) {
        const keyToB64 = (key) => {
            const keyBuf = subscription.getKey(key);
            if (!keyBuf) return '';
            const arr = new Uint8Array(keyBuf);
            let s = '';
            for (const b of arr) s += String.fromCharCode(b);
            return btoa(s);
        };
        return {
            username: this.currentUser.username,
            endpoint: subscription.endpoint,
            p256dh: keyToB64('p256dh'),
            auth: keyToB64('auth'),
            enabled: true,
            user_agent: navigator.userAgent,
        };
    }

    async _savePushSubscriptionToDb(subscription) {
        const row = this._subToRow(subscription);
        const { error } = await this.supabase
            .from('anticode_push_subscriptions')
            .upsert(row, { onConflict: 'endpoint' });
        if (error) {
            console.error('push subscription upsert failed:', error);
            alert("푸시 등록 DB 저장 실패: " + (error.message || error));
        }
    }

    async _disablePushSubscriptionInDb(subscription) {
        try {
            const { error } = await this.supabase
                .from('anticode_push_subscriptions')
                .update({ enabled: false })
                .eq('endpoint', subscription.endpoint);
            if (error) console.warn('disable push subscription failed:', error);
        } catch (_) { }
    }

    async enablePush() {
        if (!this._pushSupported()) return alert('이 브라우저는 푸시 알림을 지원하지 않습니다.');
        if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.startsWith('VITE_')) {
            alert('VAPID_PUBLIC_KEY가 설정되지 않았습니다. 배포 환경변수에 VAPID_PUBLIC_KEY를 넣어주세요.');
            return;
        }
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
            alert('OS 알림 권한이 필요합니다. 브라우저 설정에서 허용해 주세요.');
            await this.refreshPushStatus();
            return;
        }
        const reg = await this._getSwRegistration();
        const desiredKey = this._base64UrlToUint8Array(VAPID_PUBLIC_KEY);

        // If a subscription already exists but was created with a different VAPID public key,
        // APNs (iOS) returns VapidPkHashMismatch. Auto-recreate the subscription in that case.
        try {
            const existing = await reg.pushManager.getSubscription();
            const reminderEq = (a, b) => {
                try {
                    const ua = a instanceof Uint8Array ? a : new Uint8Array(a);
                    const ub = b instanceof Uint8Array ? b : new Uint8Array(b);
                    if (ua.length !== ub.length) return false;
                    for (let i = 0; i < ua.length; i++) if (ua[i] !== ub[i]) return false;
                    return true;
                } catch (_) { return false; }
            };
            const existingKey = existing?.options?.applicationServerKey;
            if (existing && existingKey && !reminderEq(existingKey, desiredKey)) {
                try { await existing.unsubscribe(); } catch (_) { }
                try { await this._disablePushSubscriptionInDb(existing); } catch (_) { }
            }
        } catch (_) { }

        const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: desiredKey
        });
        await this._savePushSubscriptionToDb(sub);
        this.pushEnabled = true;
        await this.refreshPushStatus();
        alert('푸시 알림이 켜졌습니다. (브라우저를 닫아도 알림 가능)');
    }

    async disablePush() {
        if (!this._pushSupported()) return;
        try {
            const reg = await this._getSwRegistration();
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                await sub.unsubscribe();
                await this._disablePushSubscriptionInDb(sub);
            }
        } catch (_) { }
        this.pushEnabled = false;
        await this.refreshPushStatus();
        alert('푸시 알림을 껐습니다.');
    }

    async sendPushTest() {
        if (!this._pushSupported()) return alert('이 브라우저는 푸시를 지원하지 않습니다.');
        if (Notification.permission !== 'granted') return alert('OS 알림 권한을 먼저 허용해 주세요.');
        try {
            const reg = await this._getSwRegistration();
            // local OS notification (online) as a quick check
            await reg.showNotification('Nanodoroshi / Anticode', {
                body: '[테스트] 푸시(알림) 표시가 정상입니다.',
                tag: 'nano_push_test',
                data: { url: '/anticode.html' }
            });
            alert('푸시 테스트 알림을 보냈습니다. (완전 오프라인 푸시는 서버 발송 설정 후 동작)');
        } catch (e) {
            alert('푸시 테스트 실패: ' + (e?.message || e));
        }
    }

    async _sendPushForChatMessage({ channel_id, author, content }) {
        try {
            const channelId = channel_id || this.activeChannel?.id;
            if (!channelId) return;
            const room = this.activeChannel?.name || channelId;
            const authorName = author || this.currentUser.nickname || this.currentUser.username;
            const bodyText = String(content ?? '').slice(0, 180);
            await fetch(`${SUPABASE_URL}/functions/v1/push-send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                },
                body: JSON.stringify({
                    kind: 'chat',
                    channel_id: channelId,
                    from_username: this.currentUser.username,
                    title: 'Nanodoroshi / Anticode',
                    body: `[${room}] ${authorName}: ${bodyText}`,
                    url: '/anticode.html'
                })
            }).catch(() => { });
        } catch (e) {
            console.warn('push-send error:', e);
        }
    }

    _resetMessageDedupeState() {
        // Important: if we keep processed IDs across channel switches,
        // initial history render can get skipped and the chat looks empty.
        this.processedMessageIds = new Set();
        this.recentMessageFingerprints = new Map();
        this.sentMessageCache = new Set();
        this.messageQueue = [];
        this.isProcessingQueue = false;
        this._panelDebounceTimer = null;
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
                .select('username, invited_by')
                .eq('channel_id', channelId);
            if (error) throw error;
            const rows = (data || []).filter(Boolean);
            const names = rows.map(r => r.username).filter(Boolean).map(String);
            // Always include channel owner if present
            const chan = this.channels.find(c => c.id === channelId);
            if (chan?.owner_id) names.push(String(chan.owner_id));
            this.channelMembers = Array.from(new Set(names));
            this.channelMemberMeta = new Map();
            for (const r of rows) {
                const u = r?.username ? String(r.username) : '';
                if (!u) continue;
                this.channelMemberMeta.set(u, { invited_by: r?.invited_by ? String(r.invited_by) : null });
            }
        } catch (e) {
            console.warn('loadChannelMembers failed:', e?.message || e);
            this.channelMembers = this.currentUser?.username ? [this.currentUser.username] : [];
            this.channelMemberMeta = new Map();
        }
    }

    async _hasChannelMembership(channelId, username) {
        const u = username || this.currentUser?.username;
        if (!u || !this.supabase) return false;
        try {
            const { data, error } = await this.supabase
                .from('anticode_channel_members')
                .select('username')
                .eq('channel_id', channelId)
                .eq('username', u)
                .limit(1);
            if (error) throw error;
            return !!(data && data.length > 0);
        } catch (_) {
            return false;
        }
    }

    async loadChannelBlocks(channelId) {
        // Load block list for this channel, scoped to current user (blocked_by = me)
        this.channelBlockedUsernames = new Set();
        try {
            const me = this.currentUser?.username;
            if (!me) return;
            const { data, error } = await this.supabase
                .from('anticode_channel_blocks')
                .select('blocked_username')
                .eq('channel_id', channelId)
                .eq('blocked_by', me);
            if (error) throw error;
            (data || []).forEach(r => {
                const u = r?.blocked_username ? String(r.blocked_username) : '';
                if (u) this.channelBlockedUsernames.add(u);
            });
        } catch (_) {
            // Table may not exist yet or RLS may block; ignore gracefully
            this.channelBlockedUsernames = new Set();
        }
    }

    _isBlockedInActiveChannel(username) {
        try {
            const u = String(username || '');
            return !!(u && this.channelBlockedUsernames?.has?.(u));
        } catch (_) {
            return false;
        }
    }

    async blockUserInActiveChannel(username) {
        if (!this.activeChannel) return false;
        const target = String(username || '');
        if (!target) return false;
        if (target === this.currentUser?.username) return false;
        if (!confirm(`${target} 님을 차단할까요?\\n(차단된 유저는 다시 초대할 수 없습니다. 차단해제로 해제 가능)`)) return false;
        try {
            const { error } = await this.supabase
                .from('anticode_channel_blocks')
                .upsert([{
                    channel_id: this.activeChannel.id,
                    blocked_username: target,
                    blocked_by: this.currentUser.username
                }], { onConflict: 'channel_id,blocked_username,blocked_by' });
            if (error) throw error;
            this.channelBlockedUsernames.add(target);
            try { this.renderFriendModalList(); } catch (_) { }
            alert('차단 완료!');
            return true;
        } catch (e) {
            console.error('blockUser failed:', e);
            alert('차단 실패: ' + (e?.message || e));
            return false;
        }
    }

    async unblockUserInActiveChannel(username) {
        if (!this.activeChannel) return false;
        const target = String(username || '');
        if (!target) return false;
        if (!confirm(`${target} 님 차단을 해제할까요?\\n(해제 후 다시 초대할 수 있습니다)`)) return false;
        try {
            const { error } = await this.supabase
                .from('anticode_channel_blocks')
                .delete()
                .eq('channel_id', this.activeChannel.id)
                .eq('blocked_username', target)
                .eq('blocked_by', this.currentUser.username);
            if (error) throw error;
            this.channelBlockedUsernames.delete(target);
            try { this.renderFriendModalList(); } catch (_) { }
            alert('차단 해제 완료!');
            return true;
        } catch (e) {
            console.error('unblockUser failed:', e);
            alert('차단 해제 실패: ' + (e?.message || e));
            return false;
        }
    }

    _isAllowedInChannel(channelId) {
        const ch = this.channels.find(c => c.id === channelId);
        if (!ch) return false;
        // Non-secret channels are open
        if (ch.type !== 'secret') return true;
        // Secret channels: owner OR invited/joined member
        if (ch.owner_id && ch.owner_id === this.currentUser?.username) return true;
        return (this.channelMembers || []).includes(this.currentUser?.username);
    }

    _canKickInActiveChannel(targetUsername) {
        try {
            if (!this.activeChannel || !targetUsername) return false;
            const target = String(targetUsername);
            const me = this.currentUser?.username ? String(this.currentUser.username) : null;
            if (!me) return false;
            if (target === me) return false;
            const owner = this.activeChannel.owner_id ? String(this.activeChannel.owner_id) : null;
            if (owner && target === owner) return false;
            if (owner && me === owner) return true; // owner can kick anyone except owner
            const meta = this.channelMemberMeta?.get?.(target);
            if (meta?.invited_by && String(meta.invited_by) === me) return true; // inviter can kick their invites
            return false;
        } catch (_) {
            return false;
        }
    }

    async kickMemberFromActiveChannel(targetUsername) {
        if (!this.activeChannel) return;
        const target = String(targetUsername || '');
        if (!target) return;
        if (!this._canKickInActiveChannel(target)) return alert('강퇴 권한이 없습니다.');
        if (!confirm(`${target} 님을 이 방에서 강퇴할까요?\\n(강퇴된 유저는 다시 들어오려면 비밀번호를 다시 입력해야 합니다)`)) return;
        try {
            const { error } = await this.supabase
                .from('anticode_channel_members')
                .delete()
                .eq('channel_id', this.activeChannel.id)
                .eq('username', target);
            if (error) throw error;
            // Auto-block kicked user so they cannot be re-invited until unblocked
            try {
                await this.supabase
                    .from('anticode_channel_blocks')
                    .upsert([{
                        channel_id: this.activeChannel.id,
                        blocked_username: target,
                        blocked_by: this.currentUser.username
                    }], { onConflict: 'channel_id,blocked_username,blocked_by' });
                this.channelBlockedUsernames.add(target);
            } catch (_) { }
            await this.loadChannelMembers(this.activeChannel.id);
            try { await this.updateChannelMemberPanel(this.channelPresenceChannel?.presenceState?.() || {}); } catch (_) { }

            // [NEW] Real-time Kick Signal
            try {
                this.voiceChannel?.send({
                    type: 'broadcast',
                    event: 'kick',
                    payload: { target: target, channel_id: this.activeChannel.id }
                });
            } catch (_) { }

            alert('강퇴 완료!');
        } catch (e) {
            console.error('kick member failed:', e);
            alert('강퇴 실패: ' + (e?.message || e));
        }
    }

    async _enforceActiveChannelAccess() {
        // If I'm removed while inside (kick), force me out.
        try {
            const channel = this.activeChannel;
            if (!channel) return;
            const me = this.currentUser?.username;
            if (!me) return;
            const isOwner = channel.owner_id && String(channel.owner_id) === String(me);
            if (isOwner) return;
            if (channel.type === 'secret') {
                const isMember = await this._hasChannelMembership(channel.id, me);
                if (!isMember) {
                    alert('이 채널에서 강퇴되었거나 권한이 없습니다.');
                    const fallback = this.channels.find(c => c.type !== 'secret') || this.channels[0];
                    if (fallback && fallback.id !== channel.id) await this.switchChannel(fallback.id);
                }
            }
        } catch (_) { }
    }

    async showUserProfile(username) {
        if (!username) return;

        let displayUid = null;
        if (this.supabase) {
            try {
                const { data } = await this.supabase
                    .from('anticode_users')
                    .select('uid')
                    .eq('username', username)
                    .maybeSingle();
                if (data && data.uid) displayUid = data.uid;
            } catch (e) { console.warn('UID fetch failed:', e); }
        }

        const uidStr = displayUid ? `UID: ${displayUid}` : 'UID: (Not Found)';
        alert(`👤 유저 프로필\n\n${uidStr}\nUsername: ${username}`);
    }

    async updateChannelMemberPanel(state) {
        const memberList = document.getElementById('member-list');
        const onlineCountText = document.getElementById('online-count');
        if (!memberList) return;

        // ✅ Requirement (2026-01): show ONLY users currently inside this chat room (presence)
        // - Free/Pro irrelevant here; admin must be included as a normal online user
        const raw = [];
        for (const id in (state || {})) {
            const arr = state?.[id];
            if (Array.isArray(arr)) {
                for (const u of arr) if (u) raw.push(u);
            }
        }

        // De-duplicate by username (presence key is username, but keep it safe)
        const byUsername = new Map();
        for (const u of raw) {
            const uname = u?.username ? String(u.username) : '';
            if (!uname) continue;
            if (!byUsername.has(uname)) byUsername.set(uname, u);
        }

        const onlineUsers = Array.from(byUsername.values());
        if (onlineCountText) onlineCountText.innerText = String(onlineUsers.length);

        // Admins first, then by nickname/username (stable + friendly)
        onlineUsers.sort((a, b) => {
            const aAdmin = String(a?.role || '').toLowerCase() === 'admin';
            const bAdmin = String(b?.role || '').toLowerCase() === 'admin';
            if (aAdmin !== bAdmin) return aAdmin ? -1 : 1;
            const an = String(a?.nickname || a?.username || '');
            const bn = String(b?.nickname || b?.username || '');
            return an.localeCompare(bn, 'ko');
        });

        const friendUsernames = new Set((this.friends || []).map(f => f.username));
        const onlineNames = new Set(onlineUsers.map(u => String(u?.username || '')).filter(Boolean));

        // Offline participants (ever chatted) = participants - currently online
        const participants = Array.isArray(this.channelParticipants) ? this.channelParticipants : [];
        const participantNames = [];
        const seen = new Set();
        for (const p of participants) {
            const uname = p?.username ? String(p.username) : (typeof p === 'string' ? p : '');
            if (!uname || seen.has(uname)) continue;
            seen.add(uname);
            if (!onlineNames.has(uname)) participantNames.push(uname);
        }

        // Render online first
        const parts = onlineUsers.map((info) => {
            const uname = String(info?.username || '');
            const nick = info?.nickname || uname;
            const tn = this._truncateName(nick, 8);
            const avatar = info?.avatar_url;
            const isFriend = friendUsernames.has(uname);
            const isAdmin = String(info?.role || '').toLowerCase() === 'admin';
            const showKick = this._canKickInActiveChannel(uname);
            const isBlocked = this._isBlockedInActiveChannel(uname);

            return `
                <div class="member-card online">
                    <div class="avatar-wrapper">
                        ${avatar ? `<img src="${avatar}" class="avatar-sm" onerror="this.onerror=null; this.src=''; this.style.display='none'; this.nextElementSibling.style.display='flex'">` : ''}
                        <div class="avatar-sm" style="${avatar ? 'display:none;' : ''}">${this.escapeHtml(String(nick || uname || '?')[0] || '?')}</div>
                        <span class="online-dot"></span>
                    </div>
                    <div class="member-info" onclick="if(window.app && window.app.showUserProfile) { window.app.showUserProfile('${uname}'); event.stopPropagation(); }" style="cursor:pointer;">
                        <span class="member-name-text" title="${this.escapeHtml(tn.full)}">${this.escapeHtml(tn.short)} ${isAdmin ? '<span class="friend-badge">[관리자]</span>' : (isFriend ? '<span class="friend-badge">[친구]</span>' : '')}</span>
                        <span class="member-status-sub">온라인 (클릭하여 UID 확인)</span>
                    </div>
                    <div class="member-actions">
                        ${showKick ? `<button class="notif-toggle-btn" style="white-space:nowrap;" onclick="window.app && window.app.kickMemberFromActiveChannel && window.app.kickMemberFromActiveChannel('${uname}')">강퇴</button>` : ''}
                        ${(showKick && !isBlocked) ? `<button class="notif-toggle-btn" style="white-space:nowrap;" onclick="window.app && window.app.blockUserInActiveChannel && window.app.blockUserInActiveChannel('${uname}')">차단</button>` : ''}
                        ${(showKick && isBlocked) ? `<button class="notif-toggle-btn on" style="white-space:nowrap;" onclick="window.app && window.app.unblockUserInActiveChannel && window.app.unblockUserInActiveChannel('${uname}')">차단해제</button>` : ''}
                    </div>
                </div>
            `;
        });

        // Then render offline participants who have chatted at least once in this room
        // PERF: batch fetch user info instead of N sequential requests (prevents "blank" panel on large rooms)
        const offlineNames = participantNames.slice(0, 500);
        const infoMap = new Map(); // username -> { nickname, avatar_url, last_seen }
        if (offlineNames.length > 0) {
            try {
                const { data, error } = await this.supabase
                    .from('anticode_users')
                    .select('username,nickname,avatar_url,last_seen')
                    .in('username', offlineNames);
                if (!error && Array.isArray(data)) {
                    for (const row of data) {
                        const u = row?.username ? String(row.username) : '';
                        if (u) infoMap.set(u, row);
                        // populate cache for later reuse
                        if (u) this.userCache[u] = row;
                    }
                }
            } catch (_) { }
        }

        for (const uname of offlineNames) {
            const info = infoMap.get(uname) || this.userCache[uname] || { nickname: uname, avatar_url: null, last_seen: null };
            const nick = info?.nickname || uname;
            const tn = this._truncateName(nick, 8);
            const avatar = info?.avatar_url;
            const isFriend = friendUsernames.has(uname);
            const lastSeen = info?.last_seen ? formatDistanceToNow(info.last_seen) : '오프라인';
            const showKick = this._canKickInActiveChannel(uname);
            const isBlocked = this._isBlockedInActiveChannel(uname);
            parts.push(`
                <div class="member-card offline">
                    <div class="avatar-wrapper">
                        ${avatar ? `<img src="${avatar}" class="avatar-sm" onerror="this.onerror=null; this.src=''; this.style.display='none'; this.nextElementSibling.style.display='flex'">` : ''}
                        <div class="avatar-sm" style="${avatar ? 'display:none;' : ''}">${this.escapeHtml(String(nick || uname || '?')[0] || '?')}</div>
                    </div>
                    <div class="member-info" onclick="if(window.app && window.app.showUserProfile) { window.app.showUserProfile('${uname}'); event.stopPropagation(); }" style="cursor:pointer;">
                        <span class="member-name-text" title="${this.escapeHtml(tn.full)}">${this.escapeHtml(tn.short)} ${isFriend ? '<span class="friend-badge">[친구]</span>' : ''}</span>
                        <span class="member-status-sub">${this.escapeHtml(lastSeen)} (클릭하여 UID 확인)</span>
                    </div>
                    <div class="member-actions">
                        ${showKick ? `<button class="notif-toggle-btn" style="white-space:nowrap;" onclick="window.app && window.app.kickMemberFromActiveChannel && window.app.kickMemberFromActiveChannel('${uname}')">강퇴</button>` : ''}
                        ${(showKick && !isBlocked) ? `<button class="notif-toggle-btn" style="white-space:nowrap;" onclick="window.app && window.app.blockUserInActiveChannel && window.app.blockUserInActiveChannel('${uname}')">차단</button>` : ''}
                        ${(showKick && isBlocked) ? `<button class="notif-toggle-btn on" style="white-space:nowrap;" onclick="window.app && window.app.unblockUserInActiveChannel && window.app.unblockUserInActiveChannel('${uname}')">차단해제</button>` : ''}
                    </div>
                </div>
            `);
        }

        if (parts.length === 0) {
            memberList.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; padding: 12px;">아직 이 채널에 참여자가 없습니다.</div>`;
            return;
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
            .on('presence', { event: 'sync' }, () => {
                const state = this.channelPresenceChannel.presenceState();
                // O(N) Optimization: Debounce panel updates to prevent DOM thrashing with many users
                if (this._panelDebounceTimer) clearTimeout(this._panelDebounceTimer);
                this._panelDebounceTimer = setTimeout(async () => {
                    await this.updateChannelMemberPanel(state);
                    await this._enforceActiveChannelAccess();
                    // If voice is enabled, opportunistically connect to peers in this channel
                    if (this.voiceEnabled) {
                        await this._reconcileVoicePeersFromPresence(state);
                    }
                    this._panelDebounceTimer = null;
                }, 500);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    const trackData = {
                        username: this.currentUser.username,
                        nickname: this.currentUser.nickname,
                        uid: this.currentUser.uid,
                        avatar_url: this.currentUser.avatar_url,
                        role: this.currentUser?.role || 'user',
                        online_at: new Date().toISOString(),
                    };
                    try { await this.channelPresenceChannel.track(trackData); } catch (_) { }
                }
            });
    }

    _setVoiceButtonState(on) {
        const btn = document.getElementById('voice-toggle-btn');
        if (!btn) return;
        btn.classList.toggle('on', !!on);
        btn.textContent = on ? '🎙️' : '🎤';
        btn.title = on ? '보이스 톡 OFF' : '보이스 톡 ON';
        // Also reflect state near the active channel button in the sidebar
        try { this.renderChannels(); } catch (_) { }
    }

    _getVoiceDeviceKey() {
        const u = this.currentUser?.username || 'anonymous';
        return `anticode_voice_device::${u}`;
    }

    _getMicGainKey() {
        const u = this.currentUser?.username || 'anonymous';
        return `anticode_mic_gain::${u}`;
    }

    loadVoiceDevicePreference() {
        try {
            const raw = localStorage.getItem(this._getVoiceDeviceKey());
            this.voiceDeviceId = raw ? String(raw) : null;
        } catch (_) {
            this.voiceDeviceId = null;
        }
    }

    loadMicGainPreference() {
        try {
            const raw = localStorage.getItem(this._getMicGainKey());
            const n = raw == null ? 1.0 : Number(raw);
            this.micGain = Number.isFinite(n) ? Math.min(2, Math.max(0, n)) : 1.0;
        } catch (_) {
            this.micGain = 1.0;
        }
    }

    saveVoiceDevicePreference(deviceId) {
        try {
            const v = deviceId ? String(deviceId) : '';
            if (v) localStorage.setItem(this._getVoiceDeviceKey(), v);
            else localStorage.removeItem(this._getVoiceDeviceKey());
            this.voiceDeviceId = v || null;
        } catch (_) { }
    }

    saveMicGainPreference(gain) {
        try {
            const g = Number(gain);
            const clamped = Number.isFinite(g) ? Math.min(2, Math.max(0, g)) : 1.0;
            localStorage.setItem(this._getMicGainKey(), String(clamped));
            this.micGain = clamped;
        } catch (_) { }
    }

    async _ensureMicPipeline({ requireMonitor = false } = {}) {
        const desiredDeviceId = this.voiceDeviceId || null;
        const deviceChanged = this._micDeviceIdInUse !== desiredDeviceId;
        const needCreate = !this._micAudioCtx || !this._micDest || !this._micRawStream;

        if (needCreate || deviceChanged) {
            await this._teardownMicPipeline({ force: true });
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) throw new Error('이 브라우저는 AudioContext를 지원하지 않습니다.');

            // Use browser built-in voice processing when available (helps normalize loudness / reduce distance effect)
            const audioConstraint = {
                ...(desiredDeviceId ? { deviceId: { exact: desiredDeviceId } } : {}),
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            };
            this._micRawStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint, video: false });
            this._micAudioCtx = new AC();
            await this._micAudioCtx.resume?.().catch(() => { });

            this._micSource = this._micAudioCtx.createMediaStreamSource(this._micRawStream);
            this._micAnalyser = this._micAudioCtx.createAnalyser();
            this._micAnalyser.fftSize = 512;
            // Compressor to reduce perceived "distance" / keep volume more consistent across talkers
            this._micCompressor = this._micAudioCtx.createDynamicsCompressor();
            // Reasonable speech-friendly defaults
            try {
                this._micCompressor.threshold.value = -18; // -24 -> -18 (Less aggressive compression)
                this._micCompressor.knee.value = 30;
                this._micCompressor.ratio.value = 6;    // 12 -> 6 (Natural voice, less distortion)
                this._micCompressor.attack.value = 0.003;
                this._micCompressor.release.value = 0.25;
            } catch (_) { }
            this._micGainNode = this._micAudioCtx.createGain();
            this._micGainNode.gain.value = this.micGain;
            this._micDest = this._micAudioCtx.createMediaStreamDestination();

            // source -> analyser -> compressor -> gain -> destination (processed stream)
            this._micSource.connect(this._micAnalyser);
            this._micAnalyser.connect(this._micCompressor);
            this._micCompressor.connect(this._micGainNode);
            this._micGainNode.connect(this._micDest);

            this._micDeviceIdInUse = desiredDeviceId;
            this.localAudioStream = this._micDest.stream; // processed stream for WebRTC
        } else {
            // Ensure gain is up-to-date
            if (this._micGainNode) this._micGainNode.gain.value = this.micGain;
            // Ensure localAudioStream points at processed stream
            if (this._micDest?.stream) this.localAudioStream = this._micDest.stream;
        }

        // Monitor (hear yourself) only when testing
        if (requireMonitor) {
            this._setMicMonitor(true);
        }
    }

    _setMicMonitor(on) {
        const ctx = this._micAudioCtx;
        const gain = this._micGainNode;
        if (!ctx || !gain) return;
        if (on && !this._micMonitorConnected) {
            try { gain.connect(ctx.destination); } catch (_) { }
            this._micMonitorConnected = true;
        } else if (!on && this._micMonitorConnected) {
            try { gain.disconnect(ctx.destination); } catch (_) { }
            this._micMonitorConnected = false;
        }
    }

    async _teardownMicPipeline({ force = false } = {}) {
        if (!force && (this._micUsers.voice || this._micUsers.test)) return;
        this._setMicMonitor(false);
        try { this._micSource?.disconnect?.(); } catch (_) { }
        try { this._micAnalyser?.disconnect?.(); } catch (_) { }
        try { this._micCompressor?.disconnect?.(); } catch (_) { }
        try { this._micGainNode?.disconnect?.(); } catch (_) { }
        try { this._micDest?.disconnect?.(); } catch (_) { }
        // Ensure the processed stream track is stopped too (important on some mobile browsers)
        try {
            if (this.localAudioStream) this.localAudioStream.getTracks().forEach(t => { try { t.stop(); } catch (_) { } });
        } catch (_) { }
        try {
            if (this._micRawStream) this._micRawStream.getTracks().forEach(t => { try { t.stop(); } catch (_) { } });
        } catch (_) { }
        try { await this._micAudioCtx?.close?.(); } catch (_) { }
        this._micDeviceIdInUse = null;
        this._micRawStream = null;
        this._micAudioCtx = null;
        this._micSource = null;
        this._micAnalyser = null;
        this._micCompressor = null;
        this._micGainNode = null;
        this._micDest = null;
        this._micMonitorConnected = false;
        // If voice/test aren't using it, also clear localAudioStream pointer
        if (!this._micUsers.voice && !this._micUsers.test) {
            this.localAudioStream = null;
        }
    }

    _startMicMeter() {
        const bar = document.getElementById('voice-mic-meter-bar');
        if (!bar || !this._micAnalyser) return;
        const analyser = this._micAnalyser;
        const buf = new Uint8Array(analyser.fftSize);
        const tick = () => {
            try {
                analyser.getByteTimeDomainData(buf);
                // RMS amplitude (0..1)
                let sum = 0;
                for (let i = 0; i < buf.length; i++) {
                    const v = (buf[i] - 128) / 128;
                    sum += v * v;
                }
                const rms = Math.sqrt(sum / buf.length);
                const pct = Math.min(100, Math.max(0, Math.round(rms * 180))); // scale for UI
                bar.style.width = pct + '%';
            } catch (_) { }
            this._micMeterRaf = requestAnimationFrame(tick);
        };
        if (this._micMeterRaf) cancelAnimationFrame(this._micMeterRaf);
        this._micMeterRaf = requestAnimationFrame(tick);
    }

    _stopMicMeter() {
        if (this._micMeterRaf) cancelAnimationFrame(this._micMeterRaf);
        this._micMeterRaf = null;
        const bar = document.getElementById('voice-mic-meter-bar');
        if (bar) bar.style.width = '0%';
    }

    async toggleMicTest() {
        const btn = document.getElementById('voice-mic-test-toggle');
        const running = !!this._micUsers.test;
        if (running) {
            this._micUsers.test = false;
            this._setMicMonitor(false);
            this._stopMicMeter();
            if (btn) btn.textContent = '마이크 OFF';
            await this._teardownMicPipeline({ force: false });
            return;
        }

        if (this.voiceEnabled) {
            const ok = confirm('보이스 톡 중에는 테스트(스피커 출력)로 인해 에코가 생길 수 있어요.\\n보이스 톡을 잠시 끄고 테스트할까요?');
            if (!ok) return;
            await this.stopVoice({ playFx: false });
        }

        try {
            this._micUsers.test = true;
            await this._ensureMicPipeline({ requireMonitor: true });
            this._startMicMeter();
            if (btn) btn.textContent = '마이크 ON';
        } catch (e) {
            console.error('Mic test error:', e);
            alert('마이크 테스트 실패: ' + (e?.message || e));
            this._micUsers.test = false;
            this._setMicMonitor(false);
            this._stopMicMeter();
            if (btn) btn.textContent = '마이크 OFF';
            await this._teardownMicPipeline({ force: true });
        }
    }

    async refreshMicDeviceList({ requestPermissionIfNeeded = false } = {}) {
        const sel = document.getElementById('voice-mic-select');
        if (!sel) return;

        // On many browsers, device labels are empty until mic permission is granted once.
        // If asked, briefly request permission so USB mic names show up.
        if (requestPermissionIfNeeded && navigator?.mediaDevices?.getUserMedia) {
            try {
                const tmp = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                tmp.getTracks().forEach(t => { try { t.stop(); } catch (_) { } });
            } catch (_) { /* ignore */ }
        }

        let devices = [];
        try {
            devices = await navigator.mediaDevices.enumerateDevices();
        } catch (e) {
            console.warn('enumerateDevices failed:', e);
        }
        const mics = (devices || []).filter(d => d.kind === 'audioinput');
        const current = this.voiceDeviceId || '';

        sel.innerHTML = '';
        const opt0 = document.createElement('option');
        opt0.value = '';
        opt0.textContent = '기본 마이크';
        sel.appendChild(opt0);

        mics.forEach((d, idx) => {
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            opt.textContent = d.label || `마이크 ${idx + 1}`;
            sel.appendChild(opt);
        });

        sel.value = current;
        if (!sel.value) sel.value = '';
    }

    async toggleVoice() {
        if (!this.activeChannel) return alert('먼저 채널을 선택하세요.');
        if (this.voiceEnabled) {
            await this.stopVoice({ playFx: true });
        } else {
            await this.startVoice({ playFx: true });
        }
    }

    async startVoice({ playFx = false } = {}) {
        if (!this.activeChannel) return;
        // Secret channels: invited-only
        if (this.activeChannel.type === 'secret' && !this._isAllowedInChannel(this.activeChannel.id)) {
            alert('초대된 멤버만 이 비밀 채팅방의 보이스 톡을 사용할 수 있습니다.');
            return;
        }

        // Free tier: enforce daily voice time limit (local enforcement)
        if (!this._isProUser()) {
            const remaining = this._getFreeVoiceRemainingSeconds();
            if (remaining <= 0) {
                alert('무료 보이스 사용 시간(하루 10분)을 모두 사용했습니다.\\n계속 사용하려면 유료 플랜 가입이 필요합니다.');
                return;
            }
        }
        try {
            // Must be called from user gesture (button click) on mobile
            this._micUsers.voice = true;
            await this._ensureMicPipeline({ requireMonitor: false });
            this.voiceEnabled = true;
            this._setVoiceButtonState(true);
            if (playFx) SoundFX.micOn();

            // Start free-tier usage timer AFTER successfully enabling voice
            if (!this._isProUser()) {
                const ok = this._startFreeVoiceLimitTimer();
                if (!ok) {
                    await this.stopVoice({ playFx: false });
                    alert('무료 보이스 사용 시간(하루 10분)을 모두 사용했습니다.\\n계속 사용하려면 유료 플랜 가입이 필요합니다.');
                    return;
                }
            }

            // Join signaling channel for this room
            this._setupVoiceSignaling(this.activeChannel.id);

            // Notify presence by rebroadcasting track data with voice flag
            try {
                if (this.channelPresenceChannel) {
                    await this.channelPresenceChannel.track({
                        username: this.currentUser.username,
                        nickname: this.currentUser.nickname,
                        uid: this.currentUser.uid,
                        avatar_url: this.currentUser.avatar_url,
                        role: this.currentUser?.role || 'user',
                        online_at: new Date().toISOString(),
                        voice: true
                    });
                }
            } catch (_) { }

            // Connect to peers who are already voice-enabled
            try {
                const state = this.channelPresenceChannel?.presenceState?.() || {};
                await this._reconcileVoicePeersFromPresence(state);
            } catch (_) { }
        } catch (e) {
            console.error('startVoice error:', e);
            alert('마이크 권한이 필요합니다.\\n' + (e?.message || e));
            this._micUsers.voice = false;
            await this.stopVoice({ playFx: false });
        }
    }

    async stopVoice({ playFx = false } = {}) {
        // Update free-tier usage before clearing timers/state
        try { this._finalizeFreeVoiceUsage(); } catch (_) { }
        this._clearVoiceLimitTimer();

        this.voiceEnabled = false;
        this._setVoiceButtonState(false);
        if (playFx) SoundFX.micOff();
        this._micUsers.voice = false;

        // Proactively tell peers we're leaving so they can cleanup immediately (helps mobile)
        try {
            const peers = Array.from(this.peerConnections.keys());
            for (const uname of peers) {
                this.voiceChannel?.send({
                    type: 'broadcast',
                    event: 'webrtc',
                    payload: { type: 'leave', from: this.currentUser.username, to: uname }
                });
            }
        } catch (_) { }

        // Update presence voice flag off
        try {
            if (this.channelPresenceChannel) {
                await this.channelPresenceChannel.track({
                    username: this.currentUser.username,
                    nickname: this.currentUser.nickname,
                    uid: this.currentUser.uid,
                    avatar_url: this.currentUser.avatar_url,
                    role: this.currentUser?.role || 'user',
                    online_at: new Date().toISOString(),
                    voice: false
                });
            }
        } catch (_) { }

        // Close peer connections
        for (const [u, pc] of this.peerConnections.entries()) {
            // Ensure we stop sending immediately on some browsers
            try {
                pc.getSenders?.().forEach(sender => {
                    try { sender.replaceTrack?.(null); } catch (_) { }
                    try { sender.track?.stop?.(); } catch (_) { }
                });
            } catch (_) { }
            try { pc.close(); } catch (_) { }
            this.peerConnections.delete(u);
        }
        // Remove audio elements
        for (const [u, el] of this.remoteAudioEls.entries()) {
            try { el.pause?.(); } catch (_) { }
            try { el.srcObject = null; el.remove(); } catch (_) { }
            this.remoteAudioEls.delete(u);
        }
        // Stop mic pipeline only if not used by mic test
        await this._teardownMicPipeline({ force: false });
        // Leave signaling channel
        try {
            if (this.voiceChannel) this.supabase.removeChannel(this.voiceChannel);
        } catch (_) { }
        this.voiceChannel = null;
    }

    _setupVoiceSignaling(channelId) {
        // Recreate signaling channel on each start to ensure room isolation.
        try { if (this.voiceChannel) this.supabase.removeChannel(this.voiceChannel); } catch (_) { }
        this.voiceChannel = this.supabase.channel(`voice_${channelId}`, {
            config: { broadcast: { self: true } }
        });

        this.voiceChannel.on('broadcast', { event: 'webrtc' }, async (payload) => {
            const msg = payload?.payload;
            if (!msg) return;
            if (msg.to && msg.to !== this.currentUser.username) return;
            if (msg.from === this.currentUser.username) return;

            if (msg.type === 'offer') await this._onOffer(msg.from, msg.sdp);
            if (msg.type === 'answer') await this._onAnswer(msg.from, msg.sdp);
            if (msg.type === 'ice') await this._onIce(msg.from, msg.candidate);
            if (msg.type === 'leave') await this._onPeerLeave(msg.from);
        }).on('broadcast', { event: 'kick' }, async (payload) => {
            // [NEW] Real-time Kick handling
            const data = payload?.payload; // { target: '...', channel_id: '...' }
            if (!data) return;
            // 1. If I am the target, I must leave
            if (data.target === this.currentUser?.username) {
                alert('이 방에서 강퇴되었습니다.');
                // Switch to default channel
                const fallback = this.channels.find(c => c.type === 'general') || this.channels[0];
                if (fallback) await this.switchChannel(fallback.id);
                else window.location.reload();
                return;
            }

            // 2. If I am an observer, remove target's messages
            // Remove from DOM
            const msgs = document.querySelectorAll(`[data-author="${data.target}"]`);
            msgs.forEach(el => el.remove());
            // Remove from local presence/member list
            try {
                // Force refresh member list (it might take a moment for presence to sync, so we can optimistically remove)
                // But presence sync handles this eventually.
            } catch (_) { }

        }).subscribe();
    }

    async _reconcileVoicePeersFromPresence(state) {
        const peers = [];
        for (const k in (state || {})) {
            const meta = state[k]?.[0];
            if (!meta) continue;
            if (meta.username === this.currentUser.username) continue;
            if (meta.voice) peers.push(meta.username);
        }
        // Create offers to peers we aren't connected to yet
        for (const uname of peers) {
            if (!this.peerConnections.has(uname)) {
                await this._createOffer(uname);
            }
        }
    }

    _createPeerConnection(remoteUsername) {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }]
        });

        pc.onicecandidate = (e) => {
            if (!e.candidate) return;
            this.voiceChannel?.send({
                type: 'broadcast',
                event: 'webrtc',
                payload: { type: 'ice', from: this.currentUser.username, to: remoteUsername, candidate: e.candidate }
            });
        };

        pc.ontrack = (e) => {
            const stream = e.streams?.[0];
            if (!stream) return;
            let audio = this.remoteAudioEls.get(remoteUsername);
            if (!audio) {
                audio = document.createElement('audio');
                audio.autoplay = true;
                audio.playsInline = true;
                audio.controls = false;
                audio.style.display = 'none';
                document.body.appendChild(audio);
                this.remoteAudioEls.set(remoteUsername, audio);
            }
            audio.srcObject = stream;
            // Mobile sometimes requires explicit play after user gesture; this is best-effort
            audio.play?.().catch(() => { });
        };

        pc.onconnectionstatechange = () => {
            const st = pc.connectionState;
            if (st === 'failed' || st === 'disconnected' || st === 'closed') {
                this._onPeerLeave(remoteUsername);
            }
        };

        // Add local tracks
        if (this.localAudioStream) {
            this.localAudioStream.getTracks().forEach(t => pc.addTrack(t, this.localAudioStream));
        }

        return pc;
    }

    async _createOffer(remoteUsername) {
        if (!this.voiceEnabled || !this.voiceChannel) return;
        const pc = this._createPeerConnection(remoteUsername);
        this.peerConnections.set(remoteUsername, pc);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.voiceChannel.send({
            type: 'broadcast',
            event: 'webrtc',
            payload: { type: 'offer', from: this.currentUser.username, to: remoteUsername, sdp: pc.localDescription }
        });
    }

    async _onOffer(fromUsername, sdp) {
        if (!this.voiceEnabled || !this.voiceChannel) return;
        let pc = this.peerConnections.get(fromUsername);
        const isNew = !pc;
        if (!pc) {
            pc = this._createPeerConnection(fromUsername);
            this.peerConnections.set(fromUsername, pc);
        }

        // Basic glare handling (polite based on username ordering)
        const polite = String(this.currentUser.username) > String(fromUsername);
        const collision = pc.signalingState !== 'stable';
        if (collision && !polite) return;
        if (collision && polite) {
            try { await pc.setLocalDescription({ type: 'rollback' }); } catch (_) { }
        }

        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.voiceChannel.send({
            type: 'broadcast',
            event: 'webrtc',
            payload: { type: 'answer', from: this.currentUser.username, to: fromUsername, sdp: pc.localDescription }
        });
    }

    async _onAnswer(fromUsername, sdp) {
        const pc = this.peerConnections.get(fromUsername);
        if (!pc) return;
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        } catch (e) {
            console.warn('setRemoteDescription(answer) failed:', e);
        }
    }

    async _onIce(fromUsername, candidate) {
        const pc = this.peerConnections.get(fromUsername);
        if (!pc || !candidate) return;
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.warn('addIceCandidate failed:', e);
        }
    }

    async _onPeerLeave(fromUsername) {
        const pc = this.peerConnections.get(fromUsername);
        if (pc) {
            try { pc.close(); } catch (_) { }
            this.peerConnections.delete(fromUsername);
        }
        const el = this.remoteAudioEls.get(fromUsername);
        if (el) {
            try { el.srcObject = null; el.remove(); } catch (_) { }
            this.remoteAudioEls.delete(fromUsername);
        }
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
        // 500KB Size Limit Check (Bypassed for Pro/Admin)
        if (file.size > 512000 && !(this._isAdmin() || this._isProUser())) {
            throw new Error(`파일 크기가 500KB를 초과합니다. (현재: ${Math.round(file.size / 1024)}KB)`);
        }

        // Prefer Cloudflare R2 (via Worker) to avoid Supabase Storage limits/cost
        // Prefer Cloudflare R2 (via Worker) to avoid Supabase Storage limits/cost
        if (R2_UPLOAD_BASE_URL && !String(R2_UPLOAD_BASE_URL).startsWith('VITE_')) {
            try {
                const base = String(R2_UPLOAD_BASE_URL).replace(/\/+$/, '');
                const url = `${base}/upload?folder=${encodeURIComponent('chat')}`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': file.type || 'application/octet-stream',
                        'X-Filename': encodeURIComponent(file.name || 'upload.bin')
                    },
                    body: file
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data?.ok) {
                    throw new Error(data?.error || `upload_failed (${res.status})`);
                }
                return data.url;
            } catch (r2Error) {
                console.warn('[AntiCode Upload] R2 Upload failed, falling back to Supabase:', r2Error);
                // Fallthrough to Supabase logic below
            }
        }

        // Fallback: Supabase Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        console.log(`[AntiCode Upload] Attempting to upload to ${bucket}/${filePath} (${Math.round(file.size / 1024)}KB)`);

        const { data, error } = await this.supabase.storage
            .from(bucket)
            .upload(filePath, file);

        if (error) {
            console.error('AntiCode Upload Error:', error);
            throw error;
        }

        const { data: { publicUrl } } = this.supabase.storage
            .from(bucket)
            .getPublicUrl(filePath);

        return publicUrl;
    }

    async init() {
        console.log('AntiCode Feature App initializing...');
        LogicWorker.init(); // [MULTI-THREAD] Start the Logic Thread

        // 0. Beta Access Check (Restrict browser access, allow only APK/App context)
        const BETA_KEY = 'ANTICODE_BETA_2026';
        const granted = localStorage.getItem('anticode_beta_granted');

        // Admin Exception: if already logged in as admin, bypass all checks
        const tempAuth = this.getAuth();
        const isAdmin = tempAuth && tempAuth.role === 'admin';

        if (!isAdmin) {
            // Check if running inside a standalone app (APK/PWA)
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone || document.referrer.includes('android-app://');

            if (!isStandalone) {
                // Block general browser access
                document.body.innerHTML = `
                    <div style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#050510; color:white; font-family:sans-serif; text-align:center; padding:20px;">
                        <h1 style="color:#00f2ff; margin-bottom:20px;">🔒 Beta Test Access Only</h1>
                        <p style="font-size:1.1rem; line-height:1.6; margin-bottom:30px;">
                            Anticode는 현재 베타 테스트 기간이며,<br>
                            전용 <b>안드로이드 앱</b>을 통해서만 접속 가능합니다.
                        </p>
                        <a href="https://github.com/srunaic/MyTestBlog/raw/main/AntiCode-Beta-Signed.apk" 
                           style="padding:15px 30px; background:#ffb92f; color:black; text-decoration:none; border-radius:8px; font-weight:bold; margin-bottom:20px;">
                           안드로이드 앱 다운로드
                        </a>
                        <p style="font-size:0.8rem; color:#888;">
                            웹 브라우저를 통한 직접 접속은 차단되었습니다.<br>
                            문의: 관리자
                        </p>
                    </div>
                `;
                return;
            }

            // If in app, check for beta key
            if (granted !== 'true') {
                const guard = document.getElementById('beta-guard');
                const input = document.getElementById('beta-key-input');
                const btn = document.getElementById('verify-beta-btn');

                if (guard && input && btn) {
                    guard.style.display = 'flex';
                    btn.onclick = () => {
                        if (input.value === BETA_KEY) {
                            localStorage.setItem('anticode_beta_granted', 'true');
                            guard.style.display = 'none';
                            this.init();
                        } else {
                            alert('잘못된 베타키입니다.');
                            input.value = '';
                        }
                    };
                    input.onkeydown = (e) => { if (e.key === 'Enter') btn.click(); };
                }
                return;
            }
        }

        // Initialize Notifications Early
        NotificationManager.init();
        // One-time audio unlock on first user interaction (helps mobile play effects reliably)
        try {
            document.addEventListener('click', () => SoundFX.ensure(), { once: true, capture: true });
            document.addEventListener('touchstart', () => SoundFX.ensure(), { once: true, capture: true });
        } catch (_) { }

        this.currentUser = this.getAuth();
        if (!this.currentUser) {
            document.getElementById('auth-guard').style.display = 'flex';
            return;
        }
        this.isAdminMode = this.currentUser.role === 'admin';

        try {
            this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

            // Best-effort: on tab/app close, immediately unsubscribe presence channels so others don't see stale "online"
            try {
                const cleanup = () => {
                    try { if (this.messageSubscription) this.supabase.removeChannel(this.messageSubscription); } catch (_) { }
                    try { if (this.channelPresenceChannel) this.supabase.removeChannel(this.channelPresenceChannel); } catch (_) { }
                    try { if (this.presenceChannel) this.supabase.removeChannel(this.presenceChannel); } catch (_) { }
                };
                window.addEventListener('pagehide', cleanup, { capture: true });
                window.addEventListener('beforeunload', cleanup, { capture: true });
            } catch (_) { }

            // Restore secret-channel unlocks for this user (password once per device/account)
            this._loadUnlockedChannels();
            // Restore preferred mic device (USB mic selection)
            this.loadVoiceDevicePreference();
            this.loadMicGainPreference();
            await this.refreshPushStatus();

            // Admin-only: auto-clean old chat messages on a 90-day cadence
            await this.maybeAutoCleanupMessages();

            // 1 & 2. Sync Metadata & Load Data in Parallel (High Speed)
            const [metadata, entitlements, channels, friends, pages] = await Promise.all([
                this.syncUserMetadata(),
                this.refreshEntitlements(),
                this.loadChannels(),
                this.loadFriends(),
                this.loadChannelPages()
            ]);

            this._loadActiveChannelPageId();
            this.renderChannelPageSelector();

            // 3. Setup UI
            this.setupEventListeners();
            this.renderUserInfo();
            this.setupPresence();

            // 4. Default Channel
            const params = new URLSearchParams(window.location.search);
            const targetChannelId = params.get('channel') || params.get('room');

            if (targetChannelId) {
                this._directJoinId = targetChannelId;
                const target = this.channels.find(c => String(c.id) === String(targetChannelId));
                if (target) {
                    await this.handleChannelSwitch(target.id);
                } else {
                    try {
                        const { data: directChannel } = await this.supabase
                            .from('anticode_channels')
                            .select('*')
                            .eq('id', targetChannelId)
                            .maybeSingle();

                        if (directChannel) {
                            const ch = new Channel(directChannel);
                            this.channels.push(ch);
                            await this.handleChannelSwitch(ch.id);
                        } else {
                            await this.handleLastVisitedOrFirstChannel();
                        }
                    } catch (_) {
                        await this.handleLastVisitedOrFirstChannel();
                    }
                }
            } else {
                await this.handleLastVisitedOrFirstChannel();
            }
        } catch (e) {
            console.error('App Init Error:', e);
        }
    }

    async handleLastVisitedOrFirstChannel() {
        if (!this.channels || this.channels.length === 0) return;

        try {
            const u = this.currentUser?.username || 'anonymous';
            const lastId = localStorage.getItem(`anticode_last_channel::${u}`);

            if (lastId) {
                const target = this.channels.find(c => String(c.id) === String(lastId));
                if (target) {
                    await this.handleChannelSwitch(target.id);
                    return;
                }
            }
        } catch (_) { }

        // Fallback to first channel if no last visited or last visited not found
        await this.handleChannelSwitch(this.channels[0].id);
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

        // Resolve plan tier after we have merged server-side user metadata
        this._refreshPlanTier();

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
                    .select('nickname, avatar_url, last_seen')
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
            return { nickname: username, avatar_url: null, last_seen: null };
        };

        this.userRequestCache[username] = fetchInfo();
        return this.userRequestCache[username];
    }

    async loadChannelParticipants(channelId) {
        // Offline list should show users who have ever chatted in this room.
        // We rely on DB-maintained table: public.anticode_channel_participants (see supabase/sql/anticode_channel_participants.sql).
        // If the table doesn't exist yet, fall back to best-effort (recent messages) so UI still works.
        try {
            const { data, error } = await this.supabase
                .from('anticode_channel_participants')
                .select('username,last_message_at')
                .eq('channel_id', channelId)
                .order('last_message_at', { ascending: false })
                .limit(5000);
            if (error) throw error;
            // If the table exists but is still empty (common right after adding trigger),
            // fall back to current retained messages so the UI doesn't look broken.
            if (Array.isArray(data) && data.length > 0) {
                this.channelParticipants = data;
                return;
            }
        } catch (e) {
            console.warn('loadChannelParticipants fallback (table missing?):', e?.message || e);
        }

        // Fallback: derive from current retained messages only (NOT truly "ever", but avoids blank offline list).
        try {
            const { data, error } = await this.supabase
                .from('anticode_messages')
                .select('user_id,created_at')
                .eq('channel_id', channelId)
                .order('created_at', { ascending: false })
                .limit(300);
            if (error) throw error;
            const seen = new Set();
            const out = [];
            for (const row of (data || [])) {
                const u = row?.user_id ? String(row.user_id) : '';
                if (!u || seen.has(u)) continue;
                seen.add(u);
                out.push({ username: u, last_message_at: row?.created_at || null });
            }
            this.channelParticipants = out;
        } catch (e2) {
            console.warn('loadChannelParticipants fallback failed:', e2?.message || e2);
            this.channelParticipants = [];
        }
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

    async removeFriend(username) {
        const target = String(username || '');
        if (!target) return false;
        if (!confirm(`${target} 님을 친구에서 삭제할까요?`)) return false;
        try {
            if (!this.friendsSchema) {
                try { await this._fetchFriendUsernames(); } catch (_) { /* ignore */ }
            }
            const userCol = this.friendsSchema?.userCol || 'user_username';
            const friendCol = this.friendsSchema?.friendCol || 'friend_username';

            await this.supabase
                .from('anticode_friends')
                .delete()
                .eq(userCol, this.currentUser.username)
                .eq(friendCol, target);

            // Best-effort reverse delete (if the table stores symmetric rows)
            try {
                await this.supabase
                    .from('anticode_friends')
                    .delete()
                    .eq(userCol, target)
                    .eq(friendCol, this.currentUser.username);
            } catch (_) { }

            await this.loadFriends();
            try { this.renderFriendModalList(); } catch (_) { }
            return true;
        } catch (e) {
            console.error('removeFriend failed:', e);
            alert('친구 삭제 실패: ' + (e?.message || e));
            return false;
        }
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
                <button class="delete-friend-btn" onclick="event.stopPropagation(); window.app && window.app.removeFriend && window.app.removeFriend('${f.username}')" title="친구 삭제">&times;</button>
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
        // reset "invite target" when closing
        this._friendModalTargetChannelId = null;
    }

    renderFriendModalList() {
        const container = document.getElementById('friend-modal-list');
        if (!container) return;

        const targetChannelId = this._friendModalTargetChannelId || this.activeChannel?.id || '';
        const targetChannel = targetChannelId ? this.channels.find(c => String(c.id) === String(targetChannelId)) : null;
        const activeChannelName = targetChannel?.name || this.activeChannel?.name || '';
        const canInvite = !!targetChannelId;

        if (!this.friends || this.friends.length === 0) {
            container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem;">친구가 없습니다.</div>`;
            return;
        }

        container.innerHTML = this.friends.map(f => {
            const isBlocked = false; // block is enforced in inviteFriendToChannel() for any channel
            const tn = this._truncateName(f.nickname || f.username, 8);
            const inviteBtn = isBlocked
                ? `<button class="notif-toggle-btn on" style="white-space:nowrap; ${canInvite ? '' : 'opacity:0.5;'}" ${canInvite ? '' : 'disabled'}
                        onclick="window.app && window.app.unblockUserInActiveChannel && window.app.unblockUserInActiveChannel('${f.username}')">차단해제</button>`
                : `<button class="notif-toggle-btn" style="white-space:nowrap; ${canInvite ? '' : 'opacity:0.5;'}" ${canInvite ? '' : 'disabled'}
                        onclick="window.app && window.app.inviteFriendToChannel && window.app.inviteFriendToChannel('${targetChannelId}','${f.username}')">${canInvite ? `초대 (${activeChannelName})` : '채널 선택 필요'}</button>`;
            const blockBtn = canInvite
                ? (`<button class="notif-toggle-btn" style="white-space:nowrap;" onclick="window.app && window.app.blockUserInActiveChannel && window.app.blockUserInActiveChannel('${f.username}')">차단</button>`)
                : '';
            return `
            <div class="member-card ${f.online ? 'online' : 'offline'}" style="margin-bottom:8px;">
                <div class="avatar-wrapper">
                    ${f.avatar_url ? `<img src="${f.avatar_url}" class="avatar-sm" onerror="this.onerror=null; this.src=''; this.style.display='none'; this.nextElementSibling.style.display='flex'">` : ''}
                    <div class="avatar-sm" style="${f.avatar_url ? 'display:none;' : ''}">${(f.nickname || f.username)[0]}</div>
                    ${f.online ? '<span class="online-dot"></span>' : ''}
                </div>
                <div class="member-info">
                    <span class="member-name-text" title="${this.escapeHtml(tn.full)}">${this.escapeHtml(tn.short)} <small>#${f.uid}</small></span>
                    <span class="member-status-sub">${f.online ? '온라인' : '오프라인'}</span>
                </div>
                <div class="member-actions">
                    <button class="notif-toggle-btn" style="white-space:nowrap;" onclick="window.app && window.app.removeFriend && window.app.removeFriend('${f.username}')">친구삭제</button>
                    ${blockBtn}
                    ${inviteBtn}
                </div>
            </div>
        `;
        }).join('');
    }

    async inviteFriendToActiveChannel(friendUsername) {
        if (!this.activeChannel) return alert('먼저 채널을 선택하세요.');
        if (!friendUsername) return;

        return await this.inviteFriendToChannel(this.activeChannel.id, friendUsername);
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

        await this.loadMyChannelMemberships(); // Load my invites for hidden chats
        this.renderChannels();
    }

    renderChannels() {
        const container = document.getElementById('categorized-channels');
        if (!container) return;

        const categories = {};
        const visible = this._getVisibleChannelsByActivePage();
        visible.forEach(ch => {
            if (!categories[ch.category]) categories[ch.category] = [];
            categories[ch.category].push(ch);
        });

        const known = Object.keys(CATEGORY_NAMES);
        const extras = Object.keys(categories).filter(k => !known.includes(k));
        const orderedCats = [...known, ...extras];

        const collapseKey = (() => {
            const u = this.currentUser?.username || 'anonymous';
            return `anticode_channel_groups_collapsed::${u}`;
        })();
        const collapsed = (() => {
            try { return JSON.parse(localStorage.getItem(collapseKey) || '{}') || {}; } catch (_) { return {}; }
        })();

        // Use DocumentFragment for faster rendering
        const fragment = document.createDocumentFragment();

        orderedCats.forEach(catId => {
            const chans = categories[catId] || [];
            if (chans.length === 0 && catId !== 'chat') return;
            const isCollapsed = !!collapsed?.[catId];

            const group = document.createElement('div');
            group.className = 'channel-group' + (isCollapsed ? ' collapsed' : '');
            group.innerHTML = `
                <div class="group-header" data-cat="${catId}" style="cursor:pointer;">
                    <span class="group-label">${isCollapsed ? '▸' : '▾'} ${CATEGORY_NAMES[catId] || ('#' + catId)}</span>
                    ${(() => {
                    if (catId !== 'chat') return '';
                    const isAppAdmin = this.isAdminMode;
                    const pageOwner = this.channelPages.find(p => p.id === this.activeChannelPageId)?.username;
                    const isPageOwner = pageOwner && String(pageOwner) === String(this.currentUser?.username);
                    return (isAppAdmin || isPageOwner) ? '<button id="open-create-channel-cat" class="add-channel-btn">+</button>' : '';
                })()}
                </div>
                <div class="sidebar-list" style="${isCollapsed ? 'display:none;' : ''}">
            ${chans.map(c => {
                    const isActive = !!(this.activeChannel && c.id === this.activeChannel.id);
                    const voiceState = { show: isActive, on: isActive && !!this.voiceEnabled };
                    // [MOD] Add visual indicator for hidden chat
                    if (c.type === 'open_hidden') {
                        // Maybe render a special icon or style, but requirement says "hidden" processing only.
                        // The sidebar item render handles basic display.
                    }
                    return c.renderSidebarItem(isActive, this.currentUser?.username, this.isAdminMode, voiceState);
                }).join('')}
                </div>
            `;

            // Event binding for collapse
            const header = group.querySelector('.group-header');
            header.onclick = (e) => {
                if (e?.target?.id === 'open-create-channel-cat') return;
                const list = group.querySelector('.sidebar-list');
                const nowCollapsed = !group.classList.contains('collapsed');
                if (nowCollapsed) { group.classList.add('collapsed'); if (list) list.style.display = 'none'; }
                else { group.classList.remove('collapsed'); if (list) list.style.display = ''; }

                try {
                    const prev = JSON.parse(localStorage.getItem(collapseKey) || '{}');
                    prev[catId] = nowCollapsed;
                    localStorage.setItem(collapseKey, JSON.stringify(prev));
                } catch (_) { }

                const label = header.querySelector('.group-label');
                if (label) label.textContent = `${nowCollapsed ? '▸' : '▾'} ${CATEGORY_NAMES[catId] || ('#' + catId)}`;
            };

            const createBtnInCat = group.querySelector('#open-create-channel-cat');
            if (createBtnInCat) createBtnInCat.onclick = () => document.getElementById('create-channel-modal').style.display = 'flex';

            fragment.appendChild(group);
        });

        container.innerHTML = '';
        container.appendChild(fragment);

        // Bind channel clicks
        container.querySelectorAll('.channel-sub-link').forEach(item => {
            item.onclick = () => this.handleChannelSwitch(item.dataset.id);
        });
    }

    async handleChannelSwitch(channelId) {
        const channel = this.channels.find(c => c.id === channelId);
        if (!channel) return;

        // Remember last visited channel for this user
        try {
            const u = this.currentUser?.username || 'anonymous';
            localStorage.setItem(`anticode_last_channel::${u}`, channelId);
        } catch (_) { }

        // If user clicks the already-active channel, do nothing (prevents reloading/clearing messages)
        if (this.activeChannel && this.activeChannel.id === channelId) {
            // Close sidebar on mobile
            document.querySelector('.anticode-sidebar')?.classList.remove('open');
            document.querySelector('.anticode-members')?.classList.remove('open');
            return;
        }

        // Password modal gate:
        // - If invited/member (or owner), allow entry without password.
        // - Otherwise, require password for password-protected channels.
        const isOwner = channel.owner_id && channel.owner_id === this.currentUser?.username;
        const isMember = isOwner ? true : await this._hasChannelMembership(channelId, this.currentUser?.username);
        // Important: if you're not a member (e.g. after kick), you MUST re-enter password (even if previously unlocked on this device).
        if (channel.password && !isMember) {
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

    copyInviteLink() {
        if (!this.activeChannel) return;

        const url = new URL(window.location.href);
        url.searchParams.set('channel', this.activeChannel.id);
        const inviteUrl = url.toString();

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(inviteUrl).then(() => {
                alert('초대 링크가 복사되었습니다!\n\n' + inviteUrl);
            }).catch(err => {
                this._fallbackCopyText(inviteUrl);
            });
        } else {
            this._fallbackCopyText(inviteUrl);
        }
    }

    _fallbackCopyText(text) {
        const input = document.createElement('textarea');
        input.value = text;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        try {
            document.execCommand('copy');
            alert('초대 링크가 복사되었습니다!\n\n' + text);
        } catch (err) {
            alert('링크 복사 실패. 아래 주소를 직접 복사해주세요:\n\n' + text);
        }
        document.body.removeChild(input);
    }

    async switchChannel(channelId) {
        const channel = this.channels.find(c => c.id === channelId);
        if (!channel) return;
        // Voice is per-channel; stop when switching channels
        if (this.voiceEnabled) await this.stopVoice({ playFx: false });
        this.activeChannel = channel;
        this._resetMessageDedupeState();
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
        await this.loadChannelBlocks(channel.id);

        // Secret channel gate: invited-only (or owner)
        // [MOD] Allow access if they have a direct invite link (the link itself is the invitation)
        if (channel.type === 'secret' && !this._isAllowedInChannel(channel.id) && this._directJoinId !== String(channel.id)) {
            alert('이 비밀 채팅방은 초대된 멤버만 입장할 수 있습니다.');
            // Attempt to fall back to a non-secret channel
            const fallback = this.channels.find(c => c.type !== 'secret' && c.type !== 'open_hidden') || this.channels[0];
            if (fallback && fallback.id !== channel.id) {
                await this.switchChannel(fallback.id);
            }
            return;
        }

        // [MOD] Hidden Open Chat Gate
        if (channel.type === 'open_hidden') {
            const me = this.currentUser?.username;
            const isOwner = String(channel.owner_id) === String(me);
            const isMember = isOwner || this.myJoinedChannelIds.has(String(channel.id));

            if (!isMember) {
                alert('이 오픈 채팅방은 비공개(초대 전용)입니다.');
                const fallback = this.channels.find(c => c.type !== 'secret' && c.type !== 'open_hidden') || this.channels[0];
                await this.switchChannel(fallback.id);
                return;
            }
        }

        // [MOD] Hidden Open Chat Gate
        if (channel.type === 'open_hidden') {
            const me = this.currentUser?.username;
            const isOwner = String(channel.owner_id) === String(me);
            const isMember = isOwner || this.myJoinedChannelIds.has(String(channel.id));

            if (!isMember) {
                alert('이 오픈 채팅방은 비공개(초대 전용)입니다.');
                const fallback = this.channels.find(c => c.type !== 'secret' && c.type !== 'open_hidden') || this.channels[0];
                await this.switchChannel(fallback.id);
                return;
            }
        }

        // Clear direct join flag after passing the gate
        if (this._directJoinId === String(channel.id)) {
            this._directJoinId = null;
        }

        // After access is granted (secret or not), mark myself as a member so I show up (and invitations persist).
        await this.ensureCurrentUserChannelMembership(channel.id);
        await this.loadChannelMembers(channel.id);
        await this.loadChannelBlocks(channel.id);

        document.getElementById('chat-input').placeholder = channel.getPlaceholder();
        await this.loadMessages(channel.id);
        this.setupMessageSubscription(channel.id);

        // Per-channel online panel
        await this.loadChannelParticipants(channel.id);
        this.setupChannelPresence(channel.id);
        try { await this.updateChannelMemberPanel(this.channelPresenceChannel.presenceState()); } catch (_) { }
    }

    async editChannelPrompt(channelId) {
        const ch = this.channels.find(c => c.id === channelId);
        if (!ch) return;

        const isOwner = this.currentUser?.username && String(ch.owner_id) === String(this.currentUser.username);
        if (!this.isAdminMode && !isOwner) return alert('관리자나 방장만 수정할 수 있습니다.');

        const newName = prompt('채널 이름', ch.name);
        if (newName == null) return;
        const newCategory = prompt('카테고리 ID (예: chat / notice / voice / karaoke / game 또는 임의 문자열)', ch.category || 'chat');
        if (newCategory == null) return;
        const newType = prompt('채널 타입 (general / secret / notice)', ch.type || 'general');
        if (newType == null) return;
        let newPassword = ch.password || '';
        if (String(newType).trim() === 'secret') {
            const p = prompt('비밀번호 (비우면 비밀번호 없음)', newPassword);
            if (p == null) return;
            newPassword = p;
        } else {
            newPassword = '';
        }

        try {
            const payload = {
                name: String(newName).trim(),
                category: String(newCategory).trim(),
                type: String(newType).trim(),
                password: (String(newType).trim() === 'secret') ? (String(newPassword || '').trim() || null) : null
            };
            const { error } = await this.supabase.from('anticode_channels').update(payload).eq('id', channelId);
            if (error) throw error;
            await this.loadChannels();
            // Refresh active channel object if needed
            if (this.activeChannel?.id === channelId) {
                this.activeChannel = this.channels.find(c => c.id === channelId) || this.activeChannel;
                this.renderChannels();
            }
            alert('채널 수정 완료!');
        } catch (e) {
            console.error('editChannel failed:', e);
            alert('채널 수정 실패: ' + (e?.message || e));
        }
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
        const pageOwner = this.channelPages.find(p => p.id === this.activeChannelPageId)?.username;
        const isPageOwner = pageOwner && String(pageOwner) === String(this.currentUser?.username);

        if (!this.isAdminMode && !isPageOwner) {
            alert('방장이나 페이지 소유자만 채널을 생성할 수 있습니다.');
            return false;
        }
        const limit = this._isProUser() ? DEFAULT_CHANNEL_LIMIT_PRO : DEFAULT_CHANNEL_LIMIT_FREE;
        const owned = (this.channels || []).filter(c => String(c.owner_id || '') === String(this.currentUser.username || '')).length;
        if (owned >= limit) {
            alert(`채널 생성 제한에 도달했습니다. (내 채널 최대 ${limit}개)\n\n더 만들려면 기존 채널을 정리하거나 Pro 플랜으로 업그레이드가 필요합니다.`);
            return false;
        }
        // If in 'all' view, it's public (admins only). If in a page, it's private to that page/owner.
        const isPublic = (this.activeChannelPageId === 'all');

        const { data, error } = await this.supabase.from('anticode_channels').insert([{
            name, type, category, password: type === 'secret' ? password : null,
            owner_id: this.currentUser.username, order: this.channels.length,
            is_public: isPublic
        }]).select();
        if (error) {
            const msg = String(error.message || '');
            if (msg.includes('channel_limit_reached')) {
                alert('채널 생성 제한에 도달했습니다. (DB 제한)\n\n기존 채널을 삭제하거나 제한값을 늘려야 합니다.');
                return false;
            }
        }
        if (!error && data) {
            const newChan = new Channel(data[0]);
            this.channels.push(newChan);

            // [NEW] If an active page is selected, automatically add this channel to it
            if (this.activeChannelPageId && this.activeChannelPageId !== 'all') {
                await this.addChannelToPage(this.activeChannelPageId, newChan.id);
            }

            this.renderChannels();
            this.switchChannel(newChan.id);
            return true;
        }
        return false;
    }

    async preloadUsers(usernames) {
        const uniqueNames = [...new Set(usernames)].filter(u => u && !this.userCache[u] && !this.userRequestCache[u]);
        if (uniqueNames.length === 0) return;

        try {
            const { data, error } = await this.supabase
                .from('anticode_users')
                .select('username, nickname, avatar_url')
                .in('username', uniqueNames);

            if (!error && data) {
                data.forEach(user => {
                    this.userCache[user.username] = { nickname: user.nickname, avatar_url: user.avatar_url };
                });
            }
        } catch (e) {
            console.warn('preloadUsers error:', e);
        }
    }

    async loadMessages(channelId) {
        const container = document.getElementById('message-container');
        if (!container) return;

        container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">메시지를 불러오는 중...</div>';

        const { data, error } = await this.supabase
            .from('anticode_messages')
            .select('*')
            .eq('channel_id', channelId)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(MESSAGE_RETENTION_PER_CHANNEL);

        if (error) {
            console.error('Failed to load messages:', error);
            container.innerHTML = '<div style="text-align:center; padding:20px; color:#ff4d4d;">메시지 로드 실패</div>';
            return;
        }

        const rows = (data || []).slice().reverse();
        const usernames = rows.map(m => m.user_id);
        await this.preloadUsers(usernames);

        // [MULTI-THREAD] Process all messages in parallel via LogicWorker
        const elementPromises = rows.map(msg => {
            const info = this.userCache[msg.user_id] || { nickname: msg.author || '?', avatar_url: null };
            return this.createMessageElementAsync(msg, info, false);
        });

        const elements = await Promise.all(elementPromises);

        container.innerHTML = '';
        const fragment = document.createDocumentFragment();
        elements.forEach(el => { if (el) fragment.appendChild(el); });

        container.appendChild(fragment);
        container.scrollTop = container.scrollHeight;
    }

    async createMessageElementAsync(msg, info, isOptimistic = false) {
        try {
            const msgEl = document.createElement('div');
            msgEl.className = 'message-item';
            msgEl.setAttribute('data-author-id', msg.user_id);
            msgEl.setAttribute('data-author', msg.author);
            if (msg.id) msgEl.id = `msg-${msg.id}`;
            if (isOptimistic) {
                msgEl.style.opacity = '0.7';
                msgEl.setAttribute('data-optimistic', 'true');
                if (msg.id) msgEl.setAttribute('data-temp-id', msg.id);
            }

            const timeStr = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const initial = (info.nickname || msg.author || '?')[0];
            const avatarHtml = `
            <div class="avatar-wrapper" style="width:32px; height:32px; position:relative; flex-shrink:0;">
                ${info.avatar_url ? `<img src="${info.avatar_url}" class="message-avatar" style="width:100%; height:100%; border-radius:50%;" onerror="this.onerror=null; this.src=''; this.style.display='none'; this.nextElementSibling.style.display='flex'">` : ''}
                <div class="user-avatar" style="width:100%; height:100%; display:${info.avatar_url ? 'none' : 'flex'}; align-items:center; justify-content:center; background:var(--accent-glow); color:var(--accent); border-radius:50%; font-weight:bold;">${initial}</div>
            </div>
        `;

            // Offload profanity and linkify to the Logic Thread (with fallback)
            let contentHtml = msg.content || '';
            if (!isOptimistic) {
                try {
                    const res = await LogicWorker.execute('PROCESS_MESSAGE', { text: msg.content || '' });
                    contentHtml = res.contentHtml;
                } catch (e) {
                    console.warn('LogicWorker fallback in createMessageElementAsync:', e);
                }
            }
            const isMyMessage = msg.user_id === this.currentUser.username;
            const canDelete = isMyMessage || this.isAdminMode;

            msgEl.innerHTML = `
                ${avatarHtml}
                <div class="message-content-wrapper">
                    <div class="message-meta">
                        <span class="member-name">${info.nickname}</span>
                        <span class="timestamp">${timeStr} <span class="sending-status">${isOptimistic ? '(전송 중...)' : ''}</span></span>
                        ${(!isOptimistic && canDelete) ? `<button class="delete-msg-btn" title="삭제" onclick="if(window.app) window.app.deleteMessage('${msg.id}')">🗑️</button>` : ''}
                    </div>
                    <div class="message-text">
                        ${contentHtml}
                        ${msg.image_url ? `<div class="message-image-content"><img src="${msg.image_url}" class="chat-img" onclick="window.open('${msg.image_url}')"></div>` : ''}
                    </div>
                </div>
            `;
            return msgEl;
        } catch (e) {
            console.error('Failed to create message element async:', e);
            return null;
        }
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
            .on('postgres_changes', {
                event: 'DELETE',
                schema: 'public',
                table: 'anticode_messages'
                // Note: filter on channel_id may not work for DELETE if not in PK, 
                // but we can filter in the callback or trust Supabase if it works.
            }, payload => {
                const id = payload.old?.id;
                if (!id) return;
                const el = document.getElementById(`msg-${id}`);
                if (el) {
                    el.style.opacity = '0';
                    setTimeout(() => el.remove(), 300);
                }
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
        if (this.presenceChannel) this.supabase.removeChannel(this.presenceChannel);
        if (this.lastSeenInterval) clearInterval(this.lastSeenInterval);

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

        // 1. Optimistic Rendering: Display immediately (Before blocking filter)
        const tempId = 'msg_' + Date.now() + Math.random().toString(36).substring(7);
        const rawContent = content; // Store raw for optimistic
        const newMessage = {
            id: tempId,
            channel_id: this.activeChannel.id,
            user_id: this.currentUser.username,
            author: this.currentUser.nickname,
            content: rawContent,
            created_at: new Date().toISOString()
        };

        input.value = '';
        input.style.height = 'auto';
        this.sentMessageCache.add(tempId);
        this.queueMessage({ ...newMessage }, true);

        // Profanity filter (Offloaded to Logic Thread) (with fallback)
        try {
            const { text: filteredText } = await LogicWorker.execute('FILTER_PROFANITY', { text: content });
            content = filteredText;
        } catch (e) {
            console.warn('LogicWorker fallback in sendMessage:', e);
        }

        // Update content for persistence/broadcast to be the filtered version
        newMessage.content = content;

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
            this._markOptimisticFailed(tempId, error?.message || String(error));
            return;
        }

        // ✅ Finalize immediately on insert success (don't wait for realtime)
        try {
            const opt = document.querySelector(`.message-item[data-optimistic="true"][data-temp-id="${tempId}"]`);
            if (opt && typeof this.finalizeOptimistic === 'function') {
                this.finalizeOptimistic(opt, { ...newMessage, id: data?.id });
            }
        } catch (_) { }

        // Offline push notification to other devices/users (requires Edge Function + push subscriptions)
        this._sendPushForChatMessage({ channel_id: this.activeChannel.id, author: this.currentUser.nickname, content });
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
        const container = document.getElementById('message-container');
        if (!container) return;

        try {
            // Defensive: ensure Set exists
            if (!this.processedMessageIds) this.processedMessageIds = new Set();

            // 1. Deduplicate by ID
            if (msg.id && this.processedMessageIds.has(msg.id)) return;

            // 2. Matching logic for non-optimistic messages
            if (!isOptimistic) {
                // Priority: Try to find and finalize an existing optimistic placeholder
                const tempId = msg.tempId || null;
                const selector = tempId
                    ? `.message-item[data-temp-id="${tempId}"]`
                    : `.message-item[data-optimistic="true"][data-author-id="${msg.user_id}"]`;

                const existing = container.querySelector(selector);
                if (existing && typeof this.finalizeOptimistic === 'function') {
                    await this.finalizeOptimistic(existing, msg);
                    return;
                }

                // If no optimistic element to finalize, check if it's a structural duplicate
                if (this._isRecentDuplicate(msg)) return;
            } else {
                // For optimistic messages, record fingerprint to prevent early realtime duplicates
                this._isRecentDuplicate(msg);
            }

            if (msg.id) this.processedMessageIds.add(msg.id);

            let info = this.userCache ? this.userCache[msg.user_id] : null;
            if (!info && typeof this.getUserInfo === 'function') {
                try {
                    info = await this.getUserInfo(msg.user_id);
                } catch (e) {
                    console.warn('getUserInfo failed in appendMessage:', e);
                }
            }
            if (!info) info = { nickname: msg.author || '알 수 없음', avatar_url: null };

            if (typeof this.createMessageElementAsync !== 'function') {
                console.error('Critical: createMessageElementAsync not found');
                return;
            }

            const msgEl = await this.createMessageElementAsync(msg, info, isOptimistic);
            if (msgEl) {
                container.appendChild(msgEl);
                if (typeof this._scrollToBottom === 'function') {
                    this._scrollToBottom();
                }
            }
        } catch (e) {
            console.error('appendMessage error:', e);
        }
    }

    _scrollToBottom() {
        const container = document.getElementById('message-container');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    async finalizeOptimistic(el, realMsg) {
        el.id = `msg-${realMsg.id}`;
        el.style.opacity = '1';
        el.removeAttribute('data-optimistic');
        // Keep data-temp-id but mark it as finalized so we don't accidentally match it again 
        // with another message, but keep it for immediate server confirmation events.
        el.setAttribute('data-finalized', 'true');

        // Record as processed to prevent realtime duplicates
        if (realMsg.id) {
            if (!this.processedMessageIds) this.processedMessageIds = new Set();
            this.processedMessageIds.add(realMsg.id);
        }
        this._isRecentDuplicate(realMsg); // Record fingerprint for filtered version

        const status = el.querySelector('.sending-status');
        if (status) status.innerText = '';

        const meta = el.querySelector('.message-meta');
        if (meta && this.isAdminMode) {
            const delBtn = document.createElement('button');
            delBtn.className = 'delete-msg-btn';
            delBtn.title = '삭제';
            delBtn.onclick = () => this.deleteMessage(realMsg.id);
            delBtn.innerText = '🗑️';
            meta.appendChild(delBtn);
        }

        // [MULTI-THREAD] Update content with the processed version from worker (with fallback)
        const textEl = el.querySelector('.message-text');
        if (textEl) {
            let contentHtml = realMsg.content || '';
            try {
                const res = await LogicWorker.execute('PROCESS_MESSAGE', { text: realMsg.content || '' });
                contentHtml = res.contentHtml;
            } catch (e) {
                console.warn('LogicWorker fallback in finalizeOptimistic:', e);
            }
            textEl.innerHTML = `
                ${contentHtml}
                ${realMsg.image_url ? `<div class="message-image-content"><img src="${realMsg.image_url}" class="chat-img" onclick="window.open('${realMsg.image_url}')"></div>` : ''}
            `;
        }
    }

    _markOptimisticFailed(tempId, reason = '') {
        try {
            const opt = document.querySelector(`.message-item[data-optimistic="true"][data-temp-id="${tempId}"]`);
            if (!opt) return;
            opt.setAttribute('data-send-failed', 'true');
            const statusText = opt.querySelector('.sending-status');
            if (statusText) statusText.textContent = '(전송 실패)';
            if (reason) console.warn('Message send failed:', reason);
        } catch (_) { }
    }

    async deleteMessage(messageId) {
        if (!messageId) return;
        if (!confirm('정말 이 메시지를 삭제하시겠습니까?')) return;

        // Instant UI: Remove from DOM immediately
        const el = document.getElementById(`msg-${messageId}`);
        const parent = el?.parentElement;
        const nextSibling = el?.nextSibling;
        if (el) el.remove();

        try {
            const { error } = await this.supabase
                .from('anticode_messages')
                .delete()
                .eq('id', messageId);

            if (error) {
                console.error('Delete error:', error);
                alert('삭제 실패: ' + error.message);
                if (el && parent) parent.insertBefore(el, nextSibling);
                return;
            }
        } catch (e) {
            console.error('Delete exception:', e);
            alert('삭제 중 오류가 발생했습니다.');
            if (el && parent) parent.insertBefore(el, nextSibling);
        }
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

        // Voice toggle (mic)
        _safeBind('voice-toggle-btn', 'onclick', async (e) => {
            try {
                e?.stopPropagation?.();
                await this.toggleVoice();
            } catch (err) {
                console.error('toggleVoice error:', err);
                alert('보이스 톡 오류: ' + (err?.message || err));
            }
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
        document.querySelectorAll('.sidebar-close-btn').forEach(btn => {
            btn.onclick = (e) => { e.stopPropagation(); toggleSidebar(false); };
        });
        _safeBind('mobile-members-toggle', 'onclick', (e) => { e.stopPropagation(); toggleMembers(); });

        _safeBind('mobile-more-btn', 'onclick', (e) => {
            e.stopPropagation();
            if (dropdown) dropdown.style.display = (dropdown.style.display === 'none' || dropdown.style.display === '') ? 'flex' : 'none';
        });

        _safeBind('menu-channels', 'onclick', (e) => { e.stopPropagation(); toggleSidebar(true); });
        _safeBind('menu-friends', 'onclick', (e) => { e.stopPropagation(); toggleSidebar(true); });
        _safeBind('menu-members', 'onclick', (e) => { e.stopPropagation(); toggleMembers(true); });
        const menuAdd = document.getElementById('menu-add');
        if (menuAdd) {
            const updateMenuAddVisibility = () => {
                const pageOwner = this.channelPages.find(p => p.id === this.activeChannelPageId)?.username;
                const isPageOwner = pageOwner && String(pageOwner) === String(this.currentUser?.username);
                if (this.isAdminMode || isPageOwner) {
                    menuAdd.style.display = 'flex';
                    menuAdd.onclick = (e) => {
                        e.stopPropagation();
                        if (dropdown) dropdown.style.display = 'none';
                        const m = document.getElementById('create-channel-modal');
                        if (m) m.style.display = 'flex';
                    };
                } else {
                    menuAdd.style.display = 'none';
                }
            };
            updateMenuAddVisibility();
            // Store as a method so it can be re-run on page switch if needed
            this._updateMenuAddVisibility = updateMenuAddVisibility;
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
            const updateCreateBtnVisibility = () => {
                const pageOwner = this.channelPages.find(p => p.id === this.activeChannelPageId)?.username;
                const isPageOwner = pageOwner && String(pageOwner) === String(this.currentUser?.username);
                if (this.isAdminMode || isPageOwner) {
                    openCreateBtn.style.display = 'flex';
                    openCreateBtn.onclick = () => cModal && (cModal.style.display = 'flex');
                } else {
                    openCreateBtn.style.display = 'none';
                }
            };
            updateCreateBtnVisibility();
            this._updateCreateBtnVisibility = updateCreateBtnVisibility;
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

        // Channel Pages / Directory Modal
        const pagesModal = document.getElementById('channel-pages-modal');
        _safeBind('open-channel-pages', 'onclick', () => this.openChannelPagesModal());
        _safeBind('close-channel-pages-modal', 'onclick', () => this.closeChannelPagesModal());
        _safeBind('menu-pages', 'onclick', (e) => {
            e.stopPropagation();
            if (dropdown) dropdown.style.display = 'none';
            this.openChannelPagesModal();
        });
        _safeBind('pages-modal-create', 'onclick', async () => {
            const name = document.getElementById('pages-modal-new-name')?.value || '';
            const ok = await this.createChannelPage(name);
            if (ok) {
                const inp = document.getElementById('pages-modal-new-name');
                if (inp) inp.value = '';
                // switch to newly created page by name
                const created = this.channelPages.find(p => p.name === String(name || '').trim());
                if (created) this._setActiveChannelPageId(created.id);
                this.renderChannelPageSelector();
                this.renderChannelPagesModal();
            }
        });
        _safeBind('pages-modal-rename-btn', 'onclick', async () => {
            const sel = document.getElementById('pages-modal-select');
            const pid = sel ? String(sel.value || '') : '';
            if (!pid || pid === 'all') return alert('이름을 바꿀 페이지를 선택하세요.');
            const name = document.getElementById('pages-modal-rename')?.value || '';
            const ok = await this.renameChannelPage(pid, name);
            if (ok) {
                const inp = document.getElementById('pages-modal-rename');
                if (inp) inp.value = '';
                this.renderChannelPagesModal();
            }
        });
        _safeBind('pages-modal-delete', 'onclick', async () => {
            const sel = document.getElementById('pages-modal-select');
            const pid = sel ? String(sel.value || '') : '';
            if (!pid || pid === 'all') return alert('삭제할 페이지를 선택하세요.');
            if (!confirm('이 페이지를 삭제할까요? (포함된 채널 매핑도 함께 삭제됩니다)')) return;
            const ok = await this.deleteChannelPage(pid);
            if (ok) this.renderChannelPagesModal();
        });
        const pagesSel = document.getElementById('pages-modal-select');
        if (pagesSel) pagesSel.onchange = () => this.renderChannelPagesModal();

        // (Guild/server pages removed for performance)

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

            // Voice mic selector: populate list and restore saved selection
            const micSel = document.getElementById('voice-mic-select');
            if (micSel) {
                // If labels are blank, user can hit "새로고침" to request permission.
                this.refreshMicDeviceList({ requestPermissionIfNeeded: false });
            }

            // Init mic gain UI from stored value
            try {
                const gainEl = document.getElementById('voice-mic-gain');
                const gainValEl = document.getElementById('voice-mic-gain-value');
                if (gainEl) {
                    const pct = Math.round((this.micGain || 1) * 100);
                    gainEl.value = String(pct);
                    if (gainValEl) gainValEl.textContent = `${pct}%`;
                }
            } catch (_) { }

            // Init notif volume + permission UI
            try {
                NotificationManager.updateOsPermissionButton();
                const nEl = document.getElementById('notif-volume');
                const nValEl = document.getElementById('notif-volume-value');
                if (nEl) {
                    const pct = Math.round((NotificationManager.volume ?? 0.8) * 100);
                    nEl.value = String(pct);
                    if (nValEl) nValEl.textContent = `${pct}%`;
                }
            } catch (_) { }

            // Init push status (offline push)
            try { this.refreshPushStatus(); } catch (_) { }
        });
        _safeBind('close-settings-modal', 'onclick', () => {
            if (sModal) sModal.style.display = 'none';
        });

        // Voice mic selector actions
        _safeBind('voice-mic-refresh', 'onclick', async () => {
            const sel = document.getElementById('voice-mic-select');
            const needsPerm = !!sel && [...sel.options].slice(1).every(o => !o.textContent || /^마이크\s+\d+$/.test(o.textContent));
            const askPerm = !this.voiceEnabled && needsPerm
                ? confirm('마이크 장치 이름(USB 마이크)을 정확히 보려면 권한이 필요할 수 있어요. 지금 권한을 요청할까요?')
                : false;
            await this.refreshMicDeviceList({ requestPermissionIfNeeded: askPerm });
        });
        _safeBind('voice-mic-apply', 'onclick', async () => {
            const sel = document.getElementById('voice-mic-select');
            const deviceId = sel ? sel.value : '';
            this.saveVoiceDevicePreference(deviceId || null);
            alert('마이크 설정이 저장되었습니다.' + (this.voiceEnabled ? ' (보이스 톡을 재시작합니다)' : ''));
            if (this.voiceEnabled) {
                // Restart voice to apply device change
                await this.stopVoice();
                await this.startVoice();
            }
            // If mic test is running, restart pipeline so it uses the new device
            if (this._micUsers.test) {
                await this._ensureMicPipeline({ requireMonitor: true });
            }
        });

        // Mic test + gain controls
        _safeBind('voice-mic-test-toggle', 'onclick', async () => {
            await this.toggleMicTest();
        });

        // Notification controls
        _safeBind('notif-os-permission', 'onclick', async () => {
            await NotificationManager.requestOsPermission();
        });
        _safeBind('notif-test-btn', 'onclick', async () => {
            NotificationManager.showInAppToast('[테스트] 알림 소리/표시 테스트');
            NotificationManager.playSound();
            try {
                await NotificationManager.showOsNotification('Nanodoroshi / Anticode', {
                    body: '[테스트] OS 알림이 정상 동작합니다.',
                    tag: 'nano_test',
                    silent: false
                });
            } catch (_) { }
        });

        // Web Push (offline push)
        _safeBind('push-enable-btn', 'onclick', async () => {
            await this.enablePush();
        });
        _safeBind('push-disable-btn', 'onclick', async () => {
            await this.disablePush();
        });
        _safeBind('push-test-btn', 'onclick', async () => {
            await this.sendPushTest();
        });
        const nVolEl = document.getElementById('notif-volume');
        const nVolValEl = document.getElementById('notif-volume-value');
        if (nVolEl) {
            const setUi = (pct) => { if (nVolValEl) nVolValEl.textContent = `${pct}%`; };
            nVolEl.oninput = () => {
                const pct = Number(nVolEl.value);
                setUi(pct);
                NotificationManager.setVolume01(Math.max(0, Math.min(1, pct / 100)));
            };
        }

        const gainEl = document.getElementById('voice-mic-gain');
        const gainValEl = document.getElementById('voice-mic-gain-value');
        const updateGainUi = (pct) => {
            if (gainValEl) gainValEl.textContent = `${pct}%`;
        };
        if (gainEl) {
            // init from stored preference
            const pct = Math.round((this.micGain || 1) * 100);
            gainEl.value = String(pct);
            updateGainUi(pct);

            gainEl.oninput = async () => {
                const pct2 = Number(gainEl.value);
                updateGainUi(pct2);
                const g = Math.min(2, Math.max(0, pct2 / 100));
                this.saveMicGainPreference(g);
                // apply live if pipeline exists
                if (this._micGainNode) this._micGainNode.gain.value = this.micGain;
            };
        }

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
                    // Remember password-unlock for this device/account (UX only)
                    try {
                        this.unlockedChannels.add(String(this.pendingChannelId));
                        this._saveUnlockedChannels();
                    } catch (_) { }
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
                    const isPro = this._isProUser();

                    // ✅ User Request:
                    // - Free: allow image attachment, but enforce 500KB (after compression)
                    // - Pro: no limit for images
                    // - Non-images: keep conservative limits

                    let uploadFile = file;
                    if (isImage) {
                        // compress first (improves speed + makes 500KB cap workable)
                        uploadFile = await this.compressImageFile(file);
                        if (!isPro) {
                            const maxBytes = 500 * 1024;
                            if (uploadFile.size > maxBytes) {
                                alert(`이미지 용량이 너무 큽니다.\\n무료 플랜은 500KB 이하만 업로드할 수 있어요.\\n(유료(Pro)는 제한 없음)`);
                                return;
                            }
                        }
                    } else {
                        const maxBytes = isPro ? (50 * 1024 * 1024) : (file.name?.toLowerCase().endsWith('.zip') ? (1 * 1024 * 1024) : (200 * 1024));
                        if (file.size > maxBytes) {
                            const limitText = isPro ? "50MB+" : (file.name?.toLowerCase().endsWith('.zip') ? "1MB" : "200KB");
                            alert(`파일 용량이 너무 큽니다.\\n현재 등급 최대 ${limitText}`);
                            return;
                        }
                    }

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
                        this._markOptimisticFailed(tempId, error?.message || String(error));
                        return;
                    }

                    try {
                        const opt = document.querySelector(`.message-item[data-optimistic="true"][data-temp-id="${tempId}"]`);
                        if (opt) this.finalizeOptimistic(opt, String(data?.id || ''));
                    } catch (_) { }

                    // Offline push notification (file/image message)
                    this._sendPushForChatMessage({ channel_id: this.activeChannel.id, author: this.currentUser.nickname, content: isImage ? '[이미지]' : fileLabel });
                } catch (err) {
                    const errMsg = err.message || JSON.stringify(err);
                    alert('이미지 업로드 실패: ' + errMsg);
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
                    const errMsg = err.message || JSON.stringify(err);
                    alert('이미지 업로드 실패: ' + errMsg);
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
