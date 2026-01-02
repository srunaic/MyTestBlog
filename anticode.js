import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ==========================================
// 1. CONFIGURATION & GLOBALS
// ==========================================
const SUPABASE_URL = 'VITE_SUPABASE_URL';
const SUPABASE_KEY = 'VITE_SUPABASE_KEY';
const SESSION_KEY = 'nano_dorothy_session';

// ==========================================
// 2. CHANNEL CLASS (OO Design)
// ==========================================
class Channel {
    constructor(data) {
        this.id = data.id || data.channel_id;
        this.name = data.name;
        this.type = data.type || 'general';
        this.order = data.order || 0;
    }

    renderHeader() {
        const hash = this.type === 'secret' ? '🔒' : '#';
        return `
            <div class="header-left">
                <span class="channel-hash">${hash}</span>
                <h1 id="current-channel-name">${this.name}</h1>
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
        this.activeChannel = null;
        this.presenceChannel = null;
        this.messageSubscription = null;
    }

    async init() {
        console.log('AntiCode OO App initializing...');

        // 1. Auth Check
        this.currentUser = this.getAuth();
        if (!this.currentUser) {
            document.getElementById('auth-guard').style.display = 'flex';
            return;
        }

        try {
            this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

            // 2. Load Channels
            await this.loadChannels();

            // 3. Initial UI
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

    async loadChannels() {
        const { data, error } = await this.supabase
            .from('anticode_channels')
            .select('*')
            .order('order', { ascending: true });

        if (!error && data && data.length > 0) {
            this.channels = data.map(d => new Channel(d));
        } else {
            // Fallback default channels if DB empty
            this.channels = [
                new Channel({ id: 'general', name: '일상-채팅', type: 'general' }),
                new Channel({ id: 'qna', name: '질문-답변', type: 'qna' }),
                new Channel({ id: 'secret', name: '비밀-실험실', type: 'secret' })
            ];
        }
        this.renderChannels();
    }

    renderChannels() {
        const list = document.getElementById('channel-list');
        list.innerHTML = this.channels.map(c =>
            c.renderSidebarItem(this.activeChannel && c.id === this.activeChannel.id)
        ).join('');

        // Re-bind clicks
        list.querySelectorAll('.channel-item').forEach(item => {
            item.onclick = () => this.switchChannel(item.dataset.id);
        });
    }

    async switchChannel(channelId) {
        const channel = this.channels.find(c => c.id === channelId);
        if (!channel) return;

        // Visual update
        this.activeChannel = channel;
        this.renderChannels();

        // Header & Input Placeholder
        const header = document.querySelector('.chat-header');
        header.innerHTML = channel.renderHeader() + `
            <div class="header-right">
                <a href="index.html" class="back-link">블로그로 돌아가기</a>
            </div>
        `;
        document.getElementById('chat-input').placeholder = channel.getPlaceholder();

        // Data update
        await this.loadMessages(channel.id);
        this.setupMessageSubscription(channel.id);
    }

    async loadMessages(channelId) {
        const { data, error } = await this.supabase
            .from('anticode_messages')
            .select('*')
            .eq('channel_id', channelId)
            .order('created_at', { ascending: true })
            .limit(50);

        if (!error) {
            document.getElementById('message-container').innerHTML = ''; // Clear
            data.forEach(msg => this.appendMessage(msg));
        }
    }

    setupMessageSubscription(channelId) {
        if (this.messageSubscription) {
            this.supabase.removeChannel(this.messageSubscription);
        }

        this.messageSubscription = this.supabase
            .channel(`channel_${channelId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'anticode_messages',
                filter: `channel_id=eq.${channelId}`
            }, payload => {
                this.appendMessage(payload.new);
            })
            .subscribe();
    }

    setupPresence() {
        this.presenceChannel = this.supabase.channel('online-users');
        this.presenceChannel
            .on('presence', { event: 'sync' }, () => {
                this.updateOnlineUsers(this.presenceChannel.presenceState());
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await this.presenceChannel.track({
                        user_id: this.currentUser.username,
                        nickname: this.currentUser.nickname,
                        online_at: new Date().toISOString(),
                    });
                }
            });
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

        const { error } = await this.supabase
            .from('anticode_messages')
            .insert([newMessage]);

        if (error) alert('메시지 전송 실패');
    }

    async createChannel(name, type) {
        const { data, error } = await this.supabase
            .from('anticode_channels')
            .insert([{
                name,
                type,
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

    // Helper UI Methods
    appendMessage(msg) {
        const container = document.getElementById('message-container');
        const msgEl = document.createElement('div');
        msgEl.className = 'message-item';
        const date = new Date(msg.created_at);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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

    renderUserInfo() {
        const info = document.getElementById('current-user-info');
        if (!info) return;
        info.innerHTML = `
            <div class="user-avatar" style="width:32px; height:32px;">${this.currentUser.nickname[0]}</div>
            <div class="user-info-text">
                <div class="member-name" style="font-size:0.8rem;">${this.currentUser.nickname}</div>
                <div style="font-size:0.6rem; color:var(--text-muted);">#${this.currentUser.username}</div>
            </div>
        `;
    }

    setupEventListeners() {
        // Send Message
        const input = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-msg-btn');
        sendBtn.onclick = () => this.sendMessage();
        input.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        };

        // Create Channel Modal
        const modal = document.getElementById('create-channel-modal');
        const openBtn = document.getElementById('open-create-channel');
        const closeBtn = document.getElementById('close-channel-modal');
        const form = document.getElementById('create-channel-form');

        openBtn.onclick = () => modal.style.display = 'flex';
        closeBtn.onclick = () => modal.style.display = 'none';

        form.onsubmit = async (e) => {
            e.preventDefault();
            const name = document.getElementById('new-channel-name').value;
            const type = document.getElementById('new-channel-type').value;
            const success = await this.createChannel(name, type);
            if (success) {
                modal.style.display = 'none';
                form.reset();
            } else {
                alert('채널 생성에 실패했습니다. DB 설정을 확인해주세요.');
            }
        };
    }
}

// Start OO App
const app = new AntiCodeApp();
app.init();
