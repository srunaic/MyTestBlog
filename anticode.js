// [DEPLOYMENT] Cloudflare Pages Sync - 2026-01-03 10:35
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ==========================================
// 1. CONFIGURATION & GLOBALS
// ==========================================
const SUPABASE_URL = 'VITE_SUPABASE_URL';
const SUPABASE_KEY = 'VITE_SUPABASE_KEY';
const VAPID_PUBLIC_KEY = 'VITE_VAPID_PUBLIC_KEY';
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

    renderSidebarItem(isActive, isAdmin, voiceState = { show: false, on: false }) {
        const hash = this.type === 'secret' ? '🔒' : '#';
        const categoryLabel = CATEGORY_NAMES[this.category] || '💬 채팅방';
        const deleteHtml = isAdmin ? `<button class="delete-channel-btn" data-id="${this.id}" onclick="event.stopPropagation(); window.app.deleteChannel('${this.id}')" title="채널 삭제">&times;</button>` : '';
        const voiceHtml = (voiceState && voiceState.show)
            ? `<span class="channel-voice-indicator ${voiceState.on ? 'on' : 'off'}" title="보이스 톡 ${voiceState.on ? 'ON' : 'OFF'}">${voiceState.on ? '🎙️' : '🎤'}</span>`
            : '';
        return `
            <div class="channel-group-item ${isActive ? 'active' : ''}">
                <div class="channel-name-row">
                    <div class="channel-name-label">${hash} ${this.name}</div>
                    <div class="channel-name-actions">
                        ${voiceHtml}
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
        if (this.initialized) return;
        this.updateBadge();
        this.updateButtons();
        this.applyVolume();
        this.updateOsPermissionButton();

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
        // Voice chat
        this.voiceEnabled = false;
        this.localAudioStream = null;
        this.voiceChannel = null; // Supabase broadcast channel for WebRTC signaling (per room)
        this.peerConnections = new Map(); // username -> RTCPeerConnection
        this.remoteAudioEls = new Map(); // username -> HTMLAudioElement
        this.voiceDeviceId = null; // preferred microphone deviceId (per user)
        this.micGain = 1.0; // 0.0 ~ 2.0
        // Shared mic pipeline (used by voice + mic test)
        this._micUsers = { voice: false, test: false };
        this._micDeviceIdInUse = null;
        this._micRawStream = null;
        this._micAudioCtx = null;
        this._micSource = null;
        this._micAnalyser = null;
        this._micGainNode = null;
        this._micDest = null; // MediaStreamDestination
        this._micMonitorConnected = false; // whether gain is connected to speakers
        this._micMeterRaf = null;
        // Push (Web Push)
        this.pushEnabled = false;
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
        const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: this._base64UrlToUint8Array(VAPID_PUBLIC_KEY)
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

    extractYouTubeId(url) {
        try {
            const u = new URL(url);
            const host = u.hostname.replace(/^www\./, '');
            // youtu.be/<id>
            if (host === 'youtu.be') {
                const id = u.pathname.split('/').filter(Boolean)[0] || '';
                return /^[\w-]{11}$/.test(id) ? id : null;
            }
            if (host.endsWith('youtube.com')) {
                // watch?v=<id>
                const v = u.searchParams.get('v');
                if (v && /^[\w-]{11}$/.test(v)) return v;
                // /shorts/<id>, /embed/<id>
                const parts = u.pathname.split('/').filter(Boolean);
                const idx = parts.findIndex(p => p === 'shorts' || p === 'embed');
                if (idx !== -1 && parts[idx + 1] && /^[\w-]{11}$/.test(parts[idx + 1])) return parts[idx + 1];
            }
            return null;
        } catch (_) {
            return null;
        }
    }

    linkify(escapedText) {
        // escapedText must already be HTML-escaped.
        const text = String(escapedText ?? '');
        const urlRe = /(https?:\/\/[^\s<]+[^\s<\.)\],!?])/g;
        return text.replace(urlRe, (rawUrl) => {
            const url = rawUrl;
            const lower = url.toLowerCase();
            const isYouTube = lower.includes('youtube.com') || lower.includes('youtu.be');
            if (isYouTube) {
                const vid = this.extractYouTubeId(url);
                const thumb = vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : null;
                const link = `<a href="${url}" target="_blank" rel="noopener noreferrer">🎬 YouTube 링크</a>`;
                const preview = thumb
                    ? `<div class="yt-preview"><a href="${url}" target="_blank" rel="noopener noreferrer"><img class="yt-thumb" src="${thumb}" alt="YouTube thumbnail" loading="lazy"></a></div>`
                    : '';
                return `${link}${preview}`;
            }
            return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
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
                // If voice is enabled, opportunistically connect to peers in this channel
                if (this.voiceEnabled) {
                    await this._reconcileVoicePeersFromPresence(state);
                }
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

            const audioConstraint = desiredDeviceId ? { deviceId: { exact: desiredDeviceId } } : true;
            this._micRawStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint, video: false });
            this._micAudioCtx = new AC();
            await this._micAudioCtx.resume?.().catch(() => { });

            this._micSource = this._micAudioCtx.createMediaStreamSource(this._micRawStream);
            this._micAnalyser = this._micAudioCtx.createAnalyser();
            this._micAnalyser.fftSize = 512;
            this._micGainNode = this._micAudioCtx.createGain();
            this._micGainNode.gain.value = this.micGain;
            this._micDest = this._micAudioCtx.createMediaStreamDestination();

            // source -> analyser -> gain -> destination (processed stream)
            this._micSource.connect(this._micAnalyser);
            this._micAnalyser.connect(this._micGainNode);
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
        try { this._micGainNode?.disconnect?.(); } catch (_) { }
        try { this._micDest?.disconnect?.(); } catch (_) { }
        try {
            if (this._micRawStream) this._micRawStream.getTracks().forEach(t => { try { t.stop(); } catch (_) { } });
        } catch (_) { }
        try { await this._micAudioCtx?.close?.(); } catch (_) { }
        this._micDeviceIdInUse = null;
        this._micRawStream = null;
        this._micAudioCtx = null;
        this._micSource = null;
        this._micAnalyser = null;
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
            if (btn) btn.textContent = '테스트 시작';
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
            if (btn) btn.textContent = '테스트 중지';
        } catch (e) {
            console.error('Mic test error:', e);
            alert('마이크 테스트 실패: ' + (e?.message || e));
            this._micUsers.test = false;
            this._setMicMonitor(false);
            this._stopMicMeter();
            if (btn) btn.textContent = '테스트 시작';
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
        try {
            // Must be called from user gesture (button click) on mobile
            this._micUsers.voice = true;
            await this._ensureMicPipeline({ requireMonitor: false });
            this.voiceEnabled = true;
            this._setVoiceButtonState(true);
            if (playFx) SoundFX.micOn();

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
        this.voiceEnabled = false;
        this._setVoiceButtonState(false);
        if (playFx) SoundFX.micOff();
        this._micUsers.voice = false;

        // Update presence voice flag off
        try {
            if (this.channelPresenceChannel) {
                await this.channelPresenceChannel.track({
                    username: this.currentUser.username,
                    nickname: this.currentUser.nickname,
                    uid: this.currentUser.uid,
                    avatar_url: this.currentUser.avatar_url,
                    online_at: new Date().toISOString(),
                    voice: false
                });
            }
        } catch (_) { }

        // Close peer connections
        for (const [u, pc] of this.peerConnections.entries()) {
            try { pc.close(); } catch (_) { }
            this.peerConnections.delete(u);
        }
        // Remove audio elements
        for (const [u, el] of this.remoteAudioEls.entries()) {
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
            audio.play?.().catch(() => {});
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

            // Restore secret-channel unlocks for this user (password once per device/account)
            this._loadUnlockedChannels();
            // Restore preferred mic device (USB mic selection)
            this.loadVoiceDevicePreference();
            this.loadMicGainPreference();
            await this.refreshPushStatus();

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
                    ${chans.map(c => {
                        const isActive = !!(this.activeChannel && c.id === this.activeChannel.id);
                        const voiceState = { show: isActive, on: isActive && !!this.voiceEnabled };
                        return c.renderSidebarItem(isActive, this.isAdminMode, voiceState);
                    }).join('')}
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
        // Voice is per-channel; stop when switching channels
        if (this.voiceEnabled) await this.stopVoice({ playFx: false });
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

                    // Offline push notification (file/image message)
                    this._sendPushForChatMessage({ channel_id: this.activeChannel.id, author: this.currentUser.nickname, content: isImage ? '[이미지]' : fileLabel });
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
