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

    renderHeader(isOwner) {
        const hash = this.type === 'secret' ? '🔒' : '#';
        let deleteBtn = '';
        if (isOwner) {
            deleteBtn = `<button id="delete-channel-btn" class="delete-channel-btn">채널 삭제</button>`;
        }
        return `
            <div class="header-left">
                <span class="channel-hash">${hash}</span>
                <h1 id="current-channel-name">${this.name}</h1>
                ${deleteBtn}
            </div>
        `;
    }

    renderSidebarItem(isActive) {
        const hash = this.type === 'secret' ? '🔒' : '# ';
        return `
            <li class="channel-item ${isActive ? 'active' : ''}" data-id="${this.id}">
                ${hash}${this.name}
            </li>
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
        this.activeChannel = null;
        this.presenceChannel = null;
        this.messageSubscription = null;
    }

    async init() {
        console.log('AntiCode Social App initializing...');

        this.currentUser = this.getAuth();
        if (!this.currentUser) {
            document.getElementById('auth-guard').style.display = 'flex';
            return;
        }

        try {
            this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

            // 1. Handle User UID
            await this.syncUserUID();

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

    // --- Social & UID Logic ---
    async syncUserUID() {
        // Look up by username
        let { data, error } = await this.supabase
            .from('anticode_users')
            .select('uid')
            .eq('username', this.currentUser.username)
            .single();

        if (error || !data) {
            // Generate new UID
            const newUID = Math.floor(100000 + Math.random() * 900000).toString();
            await this.supabase.from('anticode_users').upsert({
                username: this.currentUser.username,
                nickname: this.currentUser.nickname,
                uid: newUID
            });
            this.currentUser.uid = newUID;
        } else {
            this.currentUser.uid = data.uid;
        }
    }

    async loadFriends() {
        const { data, error } = await this.supabase
            .from('anticode_friends')
            .select('friend_id, anticode_users(username, nickname, uid)')
            .eq('user_id', this.currentUser.username);

        if (!error && data) {
            this.friends = data.map(d => ({
                username: d.anticode_users.username,
                nickname: d.anticode_users.nickname,
                uid: d.anticode_users.uid,
                online: false
            }));
            this.renderFriends();
        }
    }

    async addFriendByUID(uid) {
        // 1. Find user by UID
        const { data: target, error: searchError } = await this.supabase
            .from('anticode_users')
            .select('username')
            .eq('uid', uid)
            .single();

        if (searchError || !target) {
            alert('해당 UID를 가진 사용자를 찾을 수 없습니다.');
            return false;
        }

        if (target.username === this.currentUser.username) {
            alert('자기 자신은 친구로 추가할 수 없습니다.');
            return false;
        }

        // 2. Add to friends table
        const { error: addError } = await this.supabase
            .from('anticode_friends')
            .insert([{ user_id: this.currentUser.username, friend_id: target.username }]);

        if (addError) {
            if (addError.code === '23505') alert('이미 친구로 등록된 사용자입니다.');
            else alert('친구 추가 중 오류가 발생했습니다.');
            return false;
        }

        await this.loadFriends();
        return true;
    }

    renderFriends() {
        const list = document.getElementById('friend-list');
        list.innerHTML = this.friends.map(f => `
            <li class="friend-item ${f.online ? 'online' : 'offline'}">
                <div class="avatar-sm">${f.nickname[0]}</div>
                <div class="member-name-text">${f.nickname} <small>#${f.uid}</small></div>
            </li>
        `).join('');
    }

    // --- Channel Logic ---
    async loadChannels() {
        const { data, error } = await this.supabase
            .from('anticode_channels')
            .select('*')
            .order('order', { ascending: true });

        if (!error && data && data.length > 0) {
            this.channels = data.map(d => new Channel(d));
        } else {
            this.channels = [
                new Channel({ id: 'general', name: '일상-채팅', type: 'general', category: 'chat' }),
            ];
        }
        this.renderChannels();
    }

    renderChannels() {
        const container = document.getElementById('categorized-channels');
        container.innerHTML = ''; // Clear

        // Categorize channels
        const categories = {};
        this.channels.forEach(ch => {
            if (!categories[ch.category]) categories[ch.category] = [];
            categories[ch.category].push(ch);
        });

        Object.keys(CATEGORY_NAMES).forEach(catId => {
            const chans = categories[catId] || [];
            if (chans.length === 0 && catId !== 'chat') return; // Don't show empty categories except chat

            const group = document.createElement('div');
            group.className = 'channel-group';
            group.innerHTML = `
                <div class="group-header">
                    <span class="group-label">${CATEGORY_NAMES[catId]}</span>
                    ${catId === 'chat' ? '<button id="open-create-channel-cat" class="add-channel-btn">+</button>' : ''}
                </div>
                <ul class="sidebar-list">
                    ${chans.map(c => c.renderSidebarItem(this.activeChannel && c.id === this.activeChannel.id)).join('')}
                </ul>
            `;
            container.appendChild(group);
        });

        // Re-bind clicks
        container.querySelectorAll('.channel-item').forEach(item => {
            item.onclick = () => this.handleChannelSwitch(item.dataset.id);
        });

        // Re-bind create button if it exists
        const createBtn = document.getElementById('open-create-channel-cat');
        if (createBtn) createBtn.onclick = () => document.getElementById('create-channel-modal').style.display = 'flex';
    }

    async handleChannelSwitch(channelId) {
        const channel = this.channels.find(c => c.id === channelId);
        if (!channel) return;

        // Password check
        if (channel.type === 'secret' && channel.password && channel.owner_id !== this.currentUser.username) {
            this.pendingChannelId = channelId;
            document.getElementById('password-entry-modal').style.display = 'flex';
            document.getElementById('entry-password-input').focus();
            return;
        }

        await this.switchChannel(channelId);
    }

    async switchChannel(channelId) {
        const channel = this.channels.find(c => c.id === channelId);
        if (!channel) return;

        this.activeChannel = channel;
        this.renderChannels();

        const isOwner = channel.owner_id === this.currentUser.username;
        const header = document.querySelector('.chat-header');
        header.innerHTML = channel.renderHeader(isOwner) + `
            <div class="header-right">
                <a href="index.html" class="back-link">블로그로 돌아가기</a>
            </div>
        `;
        document.getElementById('chat-input').placeholder = channel.getPlaceholder();

        // Bind delete if exists
        const delBtn = document.getElementById('delete-channel-btn');
        if (delBtn) delBtn.onclick = () => this.deleteChannel(channel.id);

        await this.loadMessages(channel.id);
        this.setupMessageSubscription(channel.id);
    }

    async deleteChannel(channelId) {
        if (!confirm('정말로 이 채널을 삭제하시겠습니까? 복구할 수 없습니다.')) return;

        const { error } = await this.supabase
            .from('anticode_channels')
            .delete()
            .eq('id', channelId);

        if (!error) {
            this.channels = this.channels.filter(c => c.id !== channelId);
            if (this.channels.length > 0) this.switchChannel(this.channels[0].id);
            else location.reload();
        } else {
            alert('채널 삭제 실패');
        }
    }

    async createChannel(name, type, category, password) {
        const { data, error } = await this.supabase
            .from('anticode_channels')
            .insert([{
                name,
                type,
                category,
                password: type === 'secret' ? password : null,
                owner_id: this.currentUser.username,
                order: this.channels.length
            }])
            .select();

        if (!error && data) {
            const newChan = new Channel(data[0]);
            this.channels.push(newChan);
            this.renderChannels();
            this.switchChannel(newChan.id);
            return true;
        }
        return false;
    }

    // --- Message & Presence Logic ---
    async loadMessages(channelId) {
        const { data, error } = await this.supabase
            .from('anticode_messages')
            .select('*')
            .eq('channel_id', channelId)
            .order('created_at', { ascending: true })
            .limit(50);

        if (!error) {
            document.getElementById('message-container').innerHTML = '';
            data.forEach(msg => this.appendMessage(msg));
        }
    }

    setupMessageSubscription(channelId) {
        if (this.messageSubscription) this.supabase.removeChannel(this.messageSubscription);
        this.messageSubscription = this.supabase
            .channel(`channel_${channelId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'anticode_messages', filter: `channel_id=eq.${channelId}` },
                payload => this.appendMessage(payload.new))
            .subscribe();
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
                    await this.presenceChannel.track({
                        username: this.currentUser.username,
                        nickname: this.currentUser.nickname,
                        uid: this.currentUser.uid,
                        online_at: new Date().toISOString(),
                    });
                }
            });
    }

    updateOnlineUsers(state) {
        const memberList = document.getElementById('member-list');
        const onlineCount = document.getElementById('online-count');
        const users = [];
        for (const id in state) users.push(state[id][0]);

        onlineCount.innerText = users.length;
        memberList.innerHTML = users.map(user => `
            <div class="member-card online">
                <div class="avatar-sm">${user.nickname[0]}</div>
                <span class="member-name-text">${user.nickname}</span>
            </div>
        `).join('');
    }

    syncFriendStatus(state) {
        const onlineUsernames = [];
        for (const id in state) onlineUsernames.push(state[id][0].username);

        this.friends.forEach(f => {
            f.online = onlineUsernames.includes(f.username);
        });
        this.renderFriends();
    }

    async sendMessage() {
        const input = document.getElementById('chat-input');
        const content = input.value.trim();
        if (!content || !this.activeChannel) return;

        const newMessage = {
            channel_id: this.activeChannel.id,
            user_id: this.currentUser.username,
            author: this.currentUser.nickname,
            content: content,
            created_at: new Date().toISOString()
        };

        input.value = '';
        const { error } = await this.supabase.from('anticode_messages').insert([newMessage]);
        if (error) alert('메시지 전송 실패');
    }

    appendMessage(msg) {
        const container = document.getElementById('message-container');
        const msgEl = document.createElement('div');
        msgEl.className = 'message-item';
        const timeStr = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        msgEl.innerHTML = `
            <div class="user-avatar">${msg.author[0]}</div>
            <div class="message-content-wrapper">
                <div class="message-meta">
                    <span class="member-name">${msg.author}</span>
                    <span class="timestamp">${timeStr}</span>
                </div>
                <div class="message-text">${msg.content}</div>
            </div>
        `;
        container.appendChild(msgEl);
        container.scrollTop = container.scrollHeight;
    }

    renderUserInfo() {
        const info = document.getElementById('current-user-info');
        if (!info) return;
        info.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <div class="user-avatar" style="width:32px; height:32px;">${this.currentUser.nickname[0]}</div>
                <div class="user-info-text">
                    <div class="member-name" style="font-size:0.8rem;">${this.currentUser.nickname}</div>
                    <div class="uid-badge">UID: ${this.currentUser.uid}</div>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        const input = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-msg-btn');
        sendBtn.onclick = () => this.sendMessage();
        input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); } };

        // Channel Modal
        const modal = document.getElementById('create-channel-modal');
        const closeBtn = document.getElementById('close-channel-modal');
        const form = document.getElementById('create-channel-form');
        const typeSelect = document.getElementById('new-channel-type');
        const passGroup = document.getElementById('password-field-group');

        typeSelect.onchange = () => passGroup.style.display = typeSelect.value === 'secret' ? 'block' : 'none';
        closeBtn.onclick = () => modal.style.display = 'none';

        form.onsubmit = async (e) => {
            e.preventDefault();
            const success = await this.createChannel(
                document.getElementById('new-channel-name').value,
                typeSelect.value,
                document.getElementById('new-channel-category').value,
                document.getElementById('new-channel-password').value
            );
            if (success) { modal.style.display = 'none'; form.reset(); }
        };

        // Friend Modal
        const fModal = document.getElementById('add-friend-modal');
        const fOpen = document.getElementById('open-add-friend');
        const fClose = document.getElementById('close-friend-modal');
        const fForm = document.getElementById('add-friend-form');

        fOpen.onclick = () => fModal.style.display = 'flex';
        fClose.onclick = () => fModal.style.display = 'none';
        fForm.onsubmit = async (e) => {
            e.preventDefault();
            const val = document.getElementById('friend-uid-input').value;
            if (await this.addFriendByUID(val)) { fModal.style.display = 'none'; fForm.reset(); }
        };

        // Password Entry Modal
        const pModal = document.getElementById('password-entry-modal');
        const pClose = document.getElementById('close-password-modal');
        const pForm = document.getElementById('password-entry-form');

        pClose.onclick = () => pModal.style.display = 'none';
        pForm.onsubmit = async (e) => {
            e.preventDefault();
            const channel = this.channels.find(c => c.id === this.pendingChannelId);
            const inputVal = document.getElementById('entry-password-input').value;
            if (channel && channel.password === inputVal) {
                pModal.style.display = 'none';
                pForm.reset();
                await this.switchChannel(this.pendingChannelId);
            } else {
                alert('비밀번호가 틀렸습니다.');
            }
        };
    }
}

const app = new AntiCodeApp();
app.init();
