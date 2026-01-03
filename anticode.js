import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ==========================================
// 1. CONFIGURATION & GLOBALS
// ==========================================
const SUPABASE_URL = 'VITE_SUPABASE_URL';
const SUPABASE_KEY = 'VITE_SUPABASE_KEY';
const SESSION_KEY = 'nano_dorothy_session';

const CATEGORY_NAMES = {
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

    renderSidebarItem(isActive) {
        const hash = this.type === 'secret' ? '🔒' : '#';
        const categoryLabel = CATEGORY_NAMES[this.category] || '💬 채팅방';
        return `
            <div class="channel-group-item ${isActive ? 'active' : ''}">
                <div class="channel-name-label">${hash} ${this.name}</div>
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
// 3. CHAT APPLICATION CLASS
// ==========================================
class AntiCodeApp {
    constructor() {
        this.supabase = null;
        this.currentUser = null;
        this.channels = [];
        this.friends = [];
        this.userCache = {}; // Cache for nickname and avatars
        this.activeChannel = null;
        this.presenceChannel = null;
        this.messageSubscription = null;
        this.unlockedChannels = new Set();
        this.sentMessageCache = new Set(); // To prevent duplicates in Optimistic UI
    }

    async init() {
        console.log('AntiCode Feature App initializing...');

        this.currentUser = this.getAuth();
        if (!this.currentUser) {
            document.getElementById('auth-guard').style.display = 'flex';
            return;
        }

        try {
            this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

        const { data, error } = await this.supabase
            .from('anticode_users')
            .select('nickname, avatar_url')
            .eq('username', username)
            .single();

        if (!error && data) {
            this.userCache[username] = data;
            return data;
        }
        return { nickname: username, avatar_url: null };
    }

    async updateProfile(nickname, avatarUrl) {
        const { error } = await this.supabase
            .from('anticode_users')
            .update({ nickname, avatar_url: avatarUrl })
            .eq('username', this.currentUser.username);

        if (!error) {
            this.currentUser.nickname = nickname;
            this.currentUser.avatar_url = avatarUrl;
            this.userCache[this.currentUser.username] = { nickname, avatar_url: avatarUrl };
            this.renderUserInfo();
            // Update session if needed
            const session = JSON.parse(localStorage.getItem(SESSION_KEY));
            session.nickname = nickname;
            localStorage.setItem(SESSION_KEY, JSON.stringify(session));
            return true;
        }
        return false;
    }

    async loadFriends() {
        const { data, error } = await this.supabase
            .from('anticode_friends')
            .select('friend_id, anticode_users(username, nickname, uid, avatar_url)')
            .eq('user_id', this.currentUser.username);

        if (!error && data) {
            this.friends = data.map(d => ({
                username: d.anticode_users.username,
                nickname: d.anticode_users.nickname,
                uid: d.anticode_users.uid,
                avatar_url: d.anticode_users.avatar_url,
                online: false
            }));
            this.renderFriends();
        }
    }

    async addFriendByUID(uid) {
        const { data: target, error: searchError } = await this.supabase
            .from('anticode_users')
            .select('username')
            .eq('uid', uid)
            .single();

        if (searchError || !target) { alert('사용자를 찾을 수 없습니다.'); return false; }
        if (target.username === this.currentUser.username) { alert('자기 자신은 친구로 추가할 수 없습니다.'); return false; }

        const { error: addError } = await this.supabase
            .from('anticode_friends')
            .insert([{ user_id: this.currentUser.username, friend_id: target.username }]);

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
                    ${f.avatar_url ? `<img src="${f.avatar_url}" class="avatar-sm">` : `<div class="avatar-sm">${f.nickname[0]}</div>`}
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
                <li class="view-all-friends" onclick="document.getElementById('friend-modal').style.display='flex'">
                    친구 더 보기...
                </li>
            `;
        }
        list.innerHTML = html;
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
                    ${catId === 'chat' ? '<button id="open-create-channel-cat" class="add-channel-btn">+</button>' : ''}
                </div>
                <div class="sidebar-list">
                    ${chans.map(c => c.renderSidebarItem(this.activeChannel && c.id === this.activeChannel.id)).join('')}
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
        this.unlockedChannels.add(channelId);
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

        document.getElementById('chat-input').placeholder = channel.getPlaceholder();
        await this.loadMessages(channel.id);
        this.setupMessageSubscription(channel.id);
    }

    async deleteChannel(channelId) {
        if (!confirm('정말로 이 채널을 삭제하시겠습니까?')) return;
        const { error } = await this.supabase.from('anticode_channels').delete().eq('id', channelId);
        if (!error) {
            this.channels = this.channels.filter(c => c.id !== channelId);
            if (this.channels.length > 0) this.switchChannel(this.channels[0].id);
            else location.reload();
        }
    }

    async createChannel(name, type, category, password) {
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
        const { data, error } = await this.supabase.from('anticode_messages').select('*').eq('channel_id', channelId).order('created_at', { ascending: true }).limit(50);
        if (!error) {
            document.getElementById('message-container').innerHTML = '';
            for (const msg of data) await this.appendMessage(msg);
        }
    }

    setupMessageSubscription(channelId) {
        if (this.messageSubscription) this.supabase.removeChannel(this.messageSubscription);

        console.log(`Subscribing to real-time messages for channel: ${channelId}`);
        this.messageSubscription = this.supabase
            .channel(`channel_${channelId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'anticode_messages',
                filter: `channel_id=eq.${channelId}`
            }, payload => {
                console.log('Real-time message received:', payload.new);
                this.appendMessage(payload.new);
            })
            .subscribe((status) => {
                console.log(`Subscription status for ${channelId}:`, status);
            });
    }

    setupPresence() {
        this.presenceChannel = this.supabase.channel('online-users');
        this.presenceChannel
            .on('presence', { event: 'sync' }, () => {
                const state = this.presenceChannel.presenceState();
                this.updateOnlineUsers(state);
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
                    this.lastSeenInterval = setInterval(() => this.updateLastSeen(), 60000); // Every minute
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
                        ${user.avatar_url ? `<img src="${user.avatar_url}" class="avatar-sm">` : `<div class="avatar-sm">${user.nickname[0]}</div>`}
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
                    ${f.avatar_url ? `<img src="${f.avatar_url}" class="avatar-sm">` : `<div class="avatar-sm">${f.nickname[0]}</div>`}
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
        const content = input.value.trim();
        if (!content || !this.activeChannel) return;

        const tempId = 'msg_' + Date.now();
        const newMessage = {
            id: tempId, // Temporary ID for collision check
            channel_id: this.activeChannel.id,
            user_id: this.currentUser.username,
            author: this.currentUser.nickname,
            content: content,
            created_at: new Date().toISOString()
        };

        // 1. Optimistic Rendering: Display immediately
        input.value = '';
        input.style.height = 'auto';
        this.sentMessageCache.add(content + newMessage.created_at);
        await this.appendMessage(newMessage, true);

        // 2. Real Server Push
        const { data, error } = await this.supabase.from('anticode_messages').insert([{
            channel_id: this.activeChannel.id,
            user_id: this.currentUser.username,
            author: this.currentUser.nickname,
            content: content
        }]).select();

        if (error) {
            console.error('Failed to send message:', error);
            // Optionally: Mark message as "failed" in UI
        }
    }

    async appendMessage(msg, isOptimistic = false) {
        // Prevent duplicates from real-time events if already rendered optimistically
        const cacheKey = msg.content + msg.created_at;
        if (!isOptimistic && this.sentMessageCache.has(cacheKey)) {
            this.sentMessageCache.delete(cacheKey);
            return;
        }

        const container = document.getElementById('message-container');
        const msgEl = document.createElement('div');
        msgEl.className = 'message-item';
        if (isOptimistic) msgEl.style.opacity = '0.7';

        const timeStr = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const info = await this.getUserInfo(msg.user_id);
        const avatarHtml = info.avatar_url ? `<img src="${info.avatar_url}" class="message-avatar">` : `<div class="user-avatar">${msg.author[0]}</div>`;

        msgEl.innerHTML = `
            ${avatarHtml}
            <div class="message-content-wrapper">
                <div class="message-meta">
                    <span class="member-name">${info.nickname}</span>
                    <span class="timestamp">${timeStr} ${isOptimistic ? '(전송 중...)' : ''}</span>
                </div>
                <div class="message-text">${msg.content}</div>
            </div>
        `;
        container.appendChild(msgEl);
        container.scrollTop = container.scrollHeight;

        // If it was optimistic, we might want to "finalize" it when the real event arrives,
        // but for now, simple duplicate prevention is more efficient.
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
        _safeBind('menu-add', 'onclick', (e) => {
            e.stopPropagation();
            if (dropdown) dropdown.style.display = 'none';
            const m = document.getElementById('create-channel-modal');
            if (m) m.style.display = 'flex';
        });
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

        _safeBind('open-create-channel', 'onclick', () => cModal && (cModal.style.display = 'flex'));
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
    }
}

const app = new AntiCodeApp();
app.init();
