// worker.js - The "Logic Thread" for Nano Dorothy / AntiCode
self.onmessage = function (event) {
    const { type, payload, id } = event.data;

    switch (type) {
        case 'FILTER_PROFANITY':
            self.postMessage({ id, result: filterProfanity(payload.text) });
            break;
        case 'LINKIFY':
            self.postMessage({ id, result: linkify(payload.text) });
            break;
        case 'ORACLE_BRAIN':
            self.postMessage({ id, result: oracleBrain(payload.query, payload.posts) });
            break;
        case 'PROCESS_MESSAGE':
            const { text: profText, flagged } = filterProfanity(payload.text);
            const contentHtml = linkify(profText);
            self.postMessage({ id, result: { contentHtml, flagged, text: profText } });
            break;
        case 'PING':
            self.postMessage({ id, result: 'PONG' });
            break;
        default:
            self.postMessage({ id, error: 'Unknown task type: ' + type });
    }
};

// --- Utilities ---

function extractYouTubeId(url) {
    if (!url) return null;
    try {
        const u = new URL(url);
        const host = u.hostname.replace(/^www\./, '');
        if (host === 'youtu.be') {
            const id = u.pathname.split('/').filter(Boolean)[0] || '';
            return /^[\w-]{11}$/.test(id) ? id : null;
        }
        if (host.endsWith('youtube.com')) {
            const v = u.searchParams.get('v');
            if (v && /^[\w-]{11}$/.test(v)) return v;
            const parts = u.pathname.split('/').filter(Boolean);
            const idx = parts.findIndex(p => p === 'shorts' || p === 'embed');
            if (idx !== -1 && parts[idx + 1] && /^[\w-]{11}$/.test(parts[idx + 1])) return parts[idx + 1];
        }
        return null;
    } catch (_) { return null; }
}

function linkify(escapedText) {
    const text = String(escapedText ?? '');
    const urlRe = /(https?:\/\/[^\s<]+[^\s<\.)\],!?])/g;
    return text.replace(urlRe, (rawUrl) => {
        const lower = rawUrl.toLowerCase();
        const isYouTube = lower.includes('youtube.com') || lower.includes('youtu.be');
        if (isYouTube) {
            const vid = extractYouTubeId(rawUrl);
            const thumb = vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : null;
            const link = `<a href="${rawUrl}" target="_blank" rel="noopener noreferrer">🎬 YouTube 링크</a>`;
            const preview = thumb
                ? `<div class="yt-preview"><a href="${rawUrl}" target="_blank" rel="noopener noreferrer"><img class="yt-thumb" src="${thumb}" alt="YouTube thumbnail" loading="lazy"></a></div>`
                : '';
            return `${link}${preview}`;
        }
        return `<a href="${rawUrl}" target="_blank" rel="noopener noreferrer">${rawUrl}</a>`;
    });
}

function filterProfanity(text) {
    const input = String(text ?? '');
    if (!input) return { text: input, flagged: false };

    const patterns = [
        /씨\s*발/gi, /시\s*발/gi, /ㅅ\s*ㅂ/gi, /ㅆ\s*ㅂ/gi,
        /병\s*신/gi, /븅\s*신/gi, /좆/gi, /존\s*나/gi,
        /개\s*새\s*끼/gi, /새\s*끼/gi, /미\s*친/gi,
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

function oracleBrain(query, posts = []) {
    const q = (query || '').toLowerCase();

    // 1. Content Awareness: Search in Posts
    const results = posts.filter(p =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.content || '').toLowerCase().includes(q) ||
        (p.category && p.category.toLowerCase().includes(q))
    );

    // 2. Media Awareness: Search for Images
    const imagePosts = results.filter(p => p.image_url && p.image_url.trim() !== '');

    // 3. Intelligence Logic (Response Generation)
    if (q.includes('이미지') || q.includes('사진') || q.includes('그림')) {
        if (imagePosts.length > 0) {
            const top = imagePosts[0];
            return {
                text: `이미지가 포함된 '${top.title}' 포스트를 찾았습니다.`,
                image: top.image_url,
                link: { action: `showDetail(${top.id})` }
            };
        }
    }

    if (results.length > 0) {
        const top = results[0];
        return {
            text: `'${top.title}' 포스트가 질문과 관련이 있어 보입니다.`,
            image: top.image_url || null,
            link: { action: `showDetail(${top.id})`, id: top.id }
        };
    }

    // 4. Default Context-Aware Responses
    if (q.includes('글') || q.includes('작성') || q.includes('포스트')) return { text: "글을 쓰려면 상단 'FEEDS' 섹션의 '글쓰기' 버튼을 누르세요. (현재 어드민 권한이 필요합니다.)" };
    if (q.includes('로그인') || q.includes('접속')) return { text: "우측 상단 'ACCESS' 버튼을 눌러 로그인하거나 회원가입할 수 있습니다." };
    if (q.includes('삭제') || q.includes('수정')) return { text: "자신이 쓴 글 상단의 ⋮ 아이콘을 눌러 수정 또는 삭제가 가능합니다." };
    if (q.includes('로또') || q.includes('예측')) return { text: "CONNECT 섹션 아래의 'LOTTO ORACLE' 메뉴를 이용해 보세요." };

    return { text: "저는 블로그 콘텐츠와 이미지, 태그를 분석하는 Oracle AI입니다. 질문을 주시면 관련 내용을 찾아드릴게요." };
}
