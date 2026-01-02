import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ==========================================
// 1. CONFIGURATION & STATE
// ==========================================
const SUPABASE_URL = 'VITE_SUPABASE_URL';
const SUPABASE_KEY = 'VITE_SUPABASE_KEY';
const SESSION_KEY = 'nano_dorothy_session';

let supabase = null;
let currentUser = null;
let currentChannel = 'general';
let messages = [];
let onlineUsers = new Map();

// ==========================================
// 2. INITIALIZATION
// ==========================================
async function init() {
    console.log('AntiCode initializing...');

    // Auth Check
    currentUser = getAuth();
    if (!currentUser) {
        document.getElementById('auth-guard').style.display = 'flex';
        return;
    }

    try {
        supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log('Supabase connected.');

        setupEventListeners();
        await loadMessages(currentChannel);
        setupRealtime();
        renderUserInfo();
    } catch (e) {
        console.error('Init Error:', e);
    }
}

function getAuth() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (Date.now() > session.expiresAt) return null;
    return session;
}

// ==========================================
// 3. REALTIME & DATA
// ==========================================
function setupRealtime() {
    // 1. Message Subscription
    supabase
        .channel('anticode_messages')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'anticode_messages',
            filter: `channel_id=eq.${currentChannel}`
        }, payload => {
            appendMessage(payload.new);
        })
        .subscribe();

    // 2. Presence tracking
    const presenceChannel = supabase.channel('online-users');
    presenceChannel
        .on('presence', { event: 'sync' }, () => {
            const newState = presenceChannel.presenceState();
            updateOnlineUsers(newState);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            console.log('Joined:', newPresences);
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            console.log('Left:', leftPresences);
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await presenceChannel.track({
                    user_id: currentUser.username,
                    nickname: currentUser.nickname,
                    online_at: new Date().toISOString(),
                });
            }
        });
}

async function loadMessages(channelId) {
    const { data, error } = await supabase
        .from('anticode_messages')
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })
        .limit(50);

    if (!error) {
        messages = data;
        renderMessages();
    }
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const content = input.value.trim();
    if (!content) return;

    const newMessage = {
        channel_id: currentChannel,
        user_id: currentUser.username,
        author: currentUser.nickname,
        content: content,
        created_at: new Date().toISOString()
    };

    input.value = '';

    const { error } = await supabase
        .from('anticode_messages')
        .insert([newMessage]);

    if (error) {
        console.error('Send Error:', error);
        alert('메시지 전송에 실패했습니다.');
    }
}

// ==========================================
// 4. RENDERING
// ==========================================
function renderMessages() {
    const container = document.getElementById('message-container');
    container.innerHTML = `
        <div class="chat-welcome">
            <h1>#${currentChannel} 채널에 오신 것을 환영합니다!</h1>
            <p>Anticode 커뮤니티의 시작점입니다.</p>
        </div>
    `;
    messages.forEach(msg => appendMessage(msg));
}

function appendMessage(msg) {
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

function updateOnlineUsers(state) {
    const memberList = document.getElementById('member-list');
    const onlineCount = document.getElementById('online-count');

    const users = [];
    for (const id in state) {
        users.push(state[id][0]);
    }

    onlineCount.innerText = users.length;
    memberList.innerHTML = users.map(user => `
        <div class="member-card online">
            <div class="avatar-sm">${user.nickname[0]}</div>
            <span class="member-name-text">${user.nickname}</span>
        </div>
    `).join('');
}

function renderUserInfo() {
    const info = document.getElementById('current-user-info');
    if (!info) return;
    info.innerHTML = `
        <div class="user-avatar" style="width:32px; height:32px;">${currentUser.nickname[0]}</div>
        <div class="user-info-text">
            <div class="member-name" style="font-size:0.8rem;">${currentUser.nickname}</div>
            <div style="font-size:0.6rem; color:var(--text-muted);">#${currentUser.username}</div>
        </div>
    `;
}

// ==========================================
// 5. EVENTS
// ==========================================
function setupEventListeners() {
    const input = document.getElementById('chat-input');
    const btn = document.getElementById('send-msg-btn');

    btn.onclick = sendMessage;
    input.onkeypress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    document.querySelectorAll('.channel-item').forEach(item => {
        item.onclick = async () => {
            const newId = item.dataset.id;
            if (newId === currentChannel) return;

            document.querySelector('.channel-item.active').classList.remove('active');
            item.classList.add('active');

            currentChannel = newId;
            document.getElementById('current-channel-name').innerText = item.innerText.replace('# ', '');
            await loadMessages(currentChannel);
        };
    });
}

// Start
init();
