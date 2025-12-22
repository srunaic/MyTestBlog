// [DEPLOYMENT CHECK] v1.0.9 - Triggering GitHub Actions
// ==========================================
// 1. IMPORTS & GLOBALS (ES Module)
// ==========================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Global State
var posts = [];
var users = [];
var defaultCats = [
    { id: 'board', name: '연구소 소식 (RESEARCH)' },
    { id: 'drawing', name: '갤러리 (DRAWINGS)' },
    { id: 'bug_report', name: '버그 신고 (BUG REPORT)' }
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
            expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours expiry
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
// 2. SUPABASE CONFIGURATION
// ==========================================
var SUPABASE_URL = 'https://xefallpzdgyjufsxpsnk.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlZmFsbHB6ZGd5anVmc3hwc25rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMDI1NjcsImV4cCI6MjA4MTg3ODU2N30.3_Mk9KxtgLF-yLONT09Iz7AogSjlIxiKQvP3wpV8yBU';

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
window.editPostAction = (id) => editPostAction(id);
window.deletePostAction = (id) => deletePostAction(id);
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
    userNav = document.getElementById('user-nav');
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
}

// ==========================================
// 4. INITIALIZATION
// ==========================================
async function init() {
    console.log('Initializing Blog...');

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

    // 4. Initial Render
    restoreUIState();
    checkSession();
    renderAll();
    restoreDrafts();
    initChatbot();

    // 4. Data Loading Status
    const statusDiv = document.createElement('div');
    statusDiv.style.position = 'fixed';
    statusDiv.style.bottom = '10px';
    statusDiv.style.left = '10px';
    statusDiv.style.padding = '5px 10px';
    statusDiv.style.borderRadius = '20px';
    statusDiv.style.fontSize = '12px';
    statusDiv.style.zIndex = '9999';
    statusDiv.style.fontWeight = 'bold';
    statusDiv.id = 'db-status-indicator';
    statusDiv.style.display = 'none'; // Hidden by default
    document.body.appendChild(statusDiv);

    if (supabase) {
        try {
            console.log('Fetching data from Supabase...');
            await loadData();

            // Check admin existence
            await ensureAdminInSupabase();

            console.log('Data loaded. Re-rendering...');
            checkSession();
            renderAll();

            // Success indicator (OPTIONAL: Uncomment to show green light)
            // statusDiv.innerHTML = '🟢 연결됨';
            // statusDiv.style.backgroundColor = '#d4edda';
            // statusDiv.style.display = 'block';

        } catch (err) {
            console.error('Data load error:', err);
        }
    } else {
        console.warn('Supabase client failed to initialize.');
    }
}
// function init code...
window.init = init; // Redundant but safe

// ==========================================
// 5. DATA FETCHING (SUPABASE)
// ==========================================
async function loadData() {
    if (!supabase) return;

    try {
        // Fetch Posts
        const { data: postData, error: postError } = await supabase
            .from('posts')
            .select('*')
            .order('created_at', { ascending: false });

        if (postError) throw postError;
        posts = postData && postData.length > 0 ? postData : [];

        // Fetch Users
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*');

        if (userError) throw userError;

        // Update local users list
        if (userData && userData.length > 0) {
            users = userData;
        }

        // Fetch Social Links
        const { data: linkData, error: linkError } = await supabase.from('social_links').select('*').order('id', { ascending: true });
        if (!linkError) socialLinks = linkData || [];

        // CRITICAL: Ensure Admin Account Exists in DB
        await ensureAdminInSupabase();

    } catch (err) {
        console.error('Data load error:', err);
        // Fallback: Ensure Admin exists locally if DB loads fail
        if (!users.find(u => u.role === 'admin')) {
            users = [{ username: 'victoryka123', password: 'Tpdlflszkdltm1@', nickname: '나노 도로시', role: 'admin' }];
        }
    }
}

async function ensureAdminInSupabase() {
    const adminUser = {
        username: 'victoryka123',
        password: 'Tpdlflszkdltm1@',
        nickname: '나노 도로시',
        role: 'admin'
    };

    // Check if admin exists in the loaded data
    const exists = users.find(u => u.username === adminUser.username);

    if (!exists) {
        console.log('Admin not found in DB. Creating now...');
        const { error } = await supabase.from('users').insert([adminUser]);
        if (error) {
            console.error('Failed to auto-create admin:', error);
        } else {
            console.log('Admin account auto-created in Supabase.');
            users.push(adminUser); // Sync local
        }
    }
}

// ==========================================
// 6. AUTHENTICATION
// ==========================================
function checkSession() {
    currentUser = SessionManager.getAuth();
    isAdminMode = currentUser && currentUser.role === 'admin';
    updateUserNav();
}

function restoreUIState() {
    const state = SessionManager.getUIState();
    if (state) {
        if (state.category) currentCategory = state.category;
        if (state.page) currentPage = state.page;
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
    if (!userNav) return;

    if (currentUser) {
        userNav.innerHTML = `
            <span class="user-info-text">${currentUser.nickname}님</span> | 
            <a href="javascript:void(0)" onclick="openAccountModal()" class="user-action-link">계정 관리</a> | 
            <a href="javascript:void(0)" onclick="logout()" class="logout-link">로그아웃</a>
        `;
        if (adminOnlyActions) adminOnlyActions.style.display = currentUser.role === 'admin' ? 'block' : 'none';
        if (userActions) userActions.style.display = 'flex';
        if (newPostBtn) newPostBtn.style.display = 'block';
        if (userMgrBtn) userMgrBtn.style.display = isAdminMode ? 'block' : 'none';
    } else {
        userNav.innerHTML = `
            <a href="javascript:void(0)" onclick="openAuthModal('login')">로그인</a> | 
            <a href="javascript:void(0)" onclick="openAuthModal('signup')">회원가입</a>
        `;
        if (adminOnlyActions) adminOnlyActions.style.display = 'none';
        if (userActions) userActions.style.display = 'flex';
        if (newPostBtn) newPostBtn.style.display = 'block';
        if (userMgrBtn) userMgrBtn.style.display = 'none';
        isAdminMode = false;
    }
    renderPosts();
    updateBulkUI();
}

window.logout = () => {
    if (confirm('로그아웃 하시겠습니까?')) {
        SessionManager.clearAuth();
        currentUser = null;
        isAdminMode = false;
        checkSession();
        renderAll();
    }
};

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
    const switchTxt = document.getElementById('auth-switch-text');
    const switchLnk = document.getElementById('auth-switch-link');

    if (title) title.textContent = mode === 'login' ? '로그인' : '회원가입';
    if (btn) btn.textContent = mode === 'login' ? '접속하기' : '가입하기';
    if (group) group.style.display = mode === 'signup' ? 'block' : 'none';
    if (switchTxt) switchTxt.textContent = mode === 'login' ? '계정이 없으신가요?' : '이미 계정이 있으신가요?';
    if (switchLnk) switchLnk.textContent = mode === 'login' ? '회원가입' : '로그인';

    if (authForm) {
        authForm.reset();
        if (mode === 'signup') {
            const signupDraft = SessionManager.getDraft(SessionManager.KEYS.DRAFT_SIGNUP);
            if (signupDraft) {
                const uInput = document.getElementById('auth-username');
                const nInput = document.getElementById('auth-nickname');
                if (uInput) uInput.value = signupDraft.username || '';
                if (nInput) nInput.value = signupDraft.nickname || '';
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

function renderBestPosts() {
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
    topPosts.forEach((post, index) => {
        const cat = categories.find(c => c.id === post.category);
        const catName = cat ? cat.name.split(' (')[0] : '미분류';
        const item = document.createElement('div');
        item.className = 'best-item';
        item.innerHTML = `
            <div class="rank-badge">0${index + 1}</div>
            <div onclick="showDetail(${post.id})" style="cursor:pointer;">
                <span class="cat-tag">${catName}</span>
                <h2>${post.title}</h2>
                <div class="item-meta">
                    <span>${post.author}</span>
                    <span>${post.date}</span>
                    <span class="view-count">조회 ${post.views || 0}</span>
                </div>
            </div>
        `;
        bestGrid.appendChild(item);
    });
}

function renderCategories() {
    if (!catList) return;
    catList.innerHTML = `<li><a class="cat-item ${currentCategory === 'all' ? 'active' : ''}" data-id="all">전체보기 (ALL)</a></li>`;
    categories.forEach(cat => {
        catList.innerHTML += `<li><a class="cat-item ${currentCategory === cat.id ? 'active' : ''}" data-id="${cat.id}">${cat.name}</a></li>`;
    });
    if (isAdminMode) {
        catList.innerHTML += `<li><a class="cat-item user-mgr-cat ${currentCategory === 'users-mgr' ? 'active' : ''}" data-id="users-mgr" style="color:#d32f2f; font-weight:bold;">👥 사용자 관리</a></li>`;
    }
    if (postCatSelect) {
        postCatSelect.innerHTML = '';
        categories.forEach(cat => postCatSelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`);
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
            <h2>전체 사용자 관리</h2>
            <p>가입된 전체 회원 목록입니다.</p>
            <button onclick="renderUserManagement()" class="sm-action-btn" style="margin-top:10px;">🔄 목록 새로고침</button>
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

    const filtered = currentCategory === 'all' ? posts : posts.filter(p => p.category === currentCategory);

    // Debug UI: Show count in header if exists
    const feedHeader = document.querySelector('.list-header h2');
    if (feedHeader) {
        feedHeader.innerHTML = `FEEDS <span style="font-size:0.6rem; opacity:0.5;">(${filtered.length} posts)</span>`;
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
        grid.innerHTML = '<div style="text-align:center; padding:50px; color:#aaa;">아직 등록된 글이 없습니다.</div>';
        const pgContainer = document.getElementById('pagination-container');
        if (pgContainer) pgContainer.innerHTML = '';
        return;
    }

    pagedPosts.forEach(post => {
        const cat = categories.find(c => c.id === post.category);
        const catName = cat ? cat.name.split(' (')[0] : '미분류';
        const isSelected = selectedPostIds.has(post.id);
        const isAuthor = currentUser && currentUser.nickname === post.author;
        const item = document.createElement('div');
        item.className = `title-item ${isSelected ? 'selected' : ''}`;
        item.innerHTML = `
            ${isAdminMode ? `<input type="checkbox" class="item-checkbox" ${isSelected ? 'checked' : ''} data-id="${post.id}">` : ''}
            <div class="title-item-inner">
                <div onclick="showDetail(${post.id})" style="cursor:pointer;">
                    <span class="cat-tag">${catName}</span>
                    <h2>${post.title}</h2>
                    <div class="item-meta">
                        <span>${post.author}</span>
                        <span>${post.date}</span>
                        <span class="view-count">조회 ${post.views || 0}</span>
                    </div>
                </div>
                ${isAuthor ? `
                <div class="item-inline-actions">
                    <button onclick="editPostAction(${post.id})" class="inline-action-btn">수정</button>
                    <button onclick="deletePostAction(${post.id})" class="inline-action-btn delete">삭제</button>
                </div>` : ''}
            </div>
        `;
        if (isAdminMode) {
            const cb = item.querySelector('.item-checkbox');
            cb.onclick = (e) => { e.stopPropagation(); toggleSelection(post.id); };
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
    const catName = categories.find(c => c.id === post.category)?.name.split(' (')[0] || '미분류';

    detailContent.innerHTML = `
        <header class="detail-header">
            <span class="tag">${catName} 아카이브</span>
            <h1>${post.title}</h1>
            <div class="detail-meta">
                <span>${post.author} 발행</span>
                <span>${post.date}</span>
                <span class="view-count">조회 ${post.views}</span>
            </div>
        </header>
        ${post.img ? `<div class="post-img-container"><img src="${post.img}" alt="본문 이미지"></div>` : ''}
        <div class="post-body">${post.content.replace(/\n/g, '<br>')}</div>
        <div class="post-footer">
            ${canManage ? `<button onclick="editPostAction(${post.id})" class="action-btn">내용 수정</button><button onclick="deletePostAction(${post.id})" class="action-btn">내용 삭제</button>` : ''}
        </div>
    `;
}
window.showDetail = showDetail;

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
            const img = document.getElementById('post-img').value;

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
                    const { data: existingUsers, error: checkError } = await supabase.from('users').select('username').eq('username', u);
                    if (!checkError && existingUsers && existingUsers.length > 0) return alert('이미 존재하는 아이디입니다. (서버 확인)');

                    const newUser = { username: u, password: p, nickname: n || u, role: 'user' };
                    const { error } = await supabase.from('users').insert([newUser]);
                    if (error) { alert('가입 실패: ' + error.message); return; }
                } else {
                    const newUser = { username: u, password: p, nickname: n || u, role: 'user' };
                    users.push(newUser);
                }
                alert('회원가입이 완료되었습니다. 로그인해 주세요.');
                SessionManager.clearDraft(SessionManager.KEYS.DRAFT_SIGNUP);
                await loadData();
                openAuthModal('login');
            } else {
                const user = users.find(user => user.username === u && user.password === p);
                if (user) {
                    currentUser = user;
                    SessionManager.saveAuth(user);
                    closeAuthModal();
                    checkSession();
                    renderAll();
                } else {
                    alert('아이디 또는 비밀번호가 틀렸습니다.');
                }
            }
        };

        // Draft Auto-save for Signup
        authForm.oninput = () => {
            if (authMode === 'signup') {
                SessionManager.saveDraft(SessionManager.KEYS.DRAFT_SIGNUP, {
                    username: document.getElementById('auth-username').value,
                    nickname: document.getElementById('auth-nickname').value
                });
            }
        };
    }

    // Account Form Submit
    if (accountForm) {
        accountForm.onsubmit = async (e) => {
            e.preventDefault();
            const newN = document.getElementById('acc-nickname').value.trim();
            const newU = document.getElementById('acc-username').value.trim();
            const newP = document.getElementById('acc-password').value.trim();
            if (newP.length < 8) return alert('비밀번호는 8자 이상.');

            if (supabase) {
                const { error } = await supabase.from('users').update({ nickname: newN, username: newU, password: newP }).eq('id', currentUser.id);
                if (error) { alert('수정 실패: ' + error.message); }
                else { alert('정보 수정 완료. 다시 로그인해주세요.'); logout(); closeAccountModal(); }
            } else {
                currentUser.nickname = newN; currentUser.username = newU; currentUser.password = newP;
                alert('수정 완료 (로컬). 다시 로그인.');
                logout(); closeAccountModal();
            }
        };
    }

    // Other Listeners
    if (backBtn) backBtn.onclick = () => { detailView.style.display = 'none'; listView.style.display = 'block'; };
    if (userMgrBtn) userMgrBtn.onclick = () => { currentCategory = 'users-mgr'; listView.style.display = 'block'; detailView.style.display = 'none'; selectedPostIds.clear(); renderUserManagement(); };
    if (manageCatsBtn) manageCatsBtn.onclick = () => { catMgrSection.style.display = catMgrSection.style.display === 'none' ? 'block' : 'none'; };
    if (addCatBtn) addCatBtn.onclick = () => {
        const name = newCatInput.value.trim();
        if (name) { categories.push({ id: 'cat_' + Date.now(), name }); newCatInput.value = ''; renderAll(); }
    };
    if (newPostBtn) newPostBtn.onclick = () => {
        if (!currentUser) { alert('로그인 후 이용 가능합니다.'); openAuthModal('login'); } else { openModal(); }
    };
    if (closeBtn) closeBtn.onclick = () => closeModal();
}

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
    document.getElementById('acc-nickname').value = currentUser.nickname;
    document.getElementById('acc-username').value = currentUser.username;
    document.getElementById('acc-password').value = currentUser.password;
};
window.closeAccountModal = () => accountModal.classList.remove('active');



// ==========================================
// 12. ORACLE HELP CHATBOT
// ==========================================
let isChatOpen = false;

function initChatbot() {
    const chatBtn = document.getElementById('chat-toggle-btn');
    const chatWindow = document.getElementById('chatbot-window');
    const chatInput = document.getElementById('chat-input');
    const chatClose = document.getElementById('close-chat');

    if (chatBtn && chatWindow) {
        chatBtn.onclick = () => {
            isChatOpen = !isChatOpen;
            chatWindow.style.display = isChatOpen ? 'flex' : 'none';
            if (isChatOpen) chatInput.focus();
        };
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
    const response = getHelpResponse(query);
    setTimeout(async () => {
        botMsg.textContent = response;
        chatBody.scrollTop = chatBody.scrollHeight;
        await logChatQuery(query, response);
    }, 800);
}

function getHelpResponse(query) {
    const q = query.toLowerCase();
    if (q.includes('글') || q.includes('작성') || q.includes('포스트')) return "글을 쓰려면 상단 'FEEDS' 섹션의 '글쓰기' 버튼을 누르세요. (현재 어드민 권한이 필요합니다.)";
    if (q.includes('로그인') || q.includes('접속')) return "우측 상단 'ACCESS' 버튼을 눌러 로그인하거나 회원가입할 수 있습니다.";
    if (q.includes('삭제') || q.includes('수정')) return "자신이 쓴 글 상단의 ⋮ 아이콘을 눌러 수정 또는 삭제가 가능합니다.";
    if (q.includes('로또') || q.includes('예측')) return "CONNECT 섹션 아래의 'LOTTO ORACLE' 메뉴를 이용해 보세요.";
    if (q.includes('도움') || q.includes('기능')) return "저는 블로그 관리 및 이용을 돕는 Oracle AI입니다. 사용자의 질문을 분석해 점점 더 똑똑해집니다.";
    return "그 질문에 대해서는 현재 분석 중입니다. 관리자가 로그를 확인하여 곧 도움말을 업데이트할 예정입니다.";
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

// Start
init();
