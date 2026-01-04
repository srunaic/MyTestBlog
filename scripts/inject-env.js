const fs = require('fs');
const path = require('path');

// Generate injected copies into .build/ (never mutate source files)
const INPUT_FILES = ['script.js', 'anticode.js'];
const BUILD_DIR = path.join(__dirname, '..', '.build');

// Never log secret values. Only log which env var names are present.
console.log("[Env Inject] Available Environment Keys:", Object.keys(process.env).filter(k => k.includes('SUPABASE') || k.includes('VITE')));

const findEnv = (namePart) => {
    // Look for exact match first
    if (process.env[namePart]) return process.env[namePart];
    if (process.env['VITE_' + namePart]) return process.env['VITE_' + namePart];

    // Fallback: look for any key that contains the part (e.g. "SUPABASE_URL" or "VITE_SUPABASE_URL")
    const foundKey = Object.keys(process.env).find(k => k.includes(namePart));
    return foundKey ? process.env[foundKey] : null;
};

const envVars = {
    'VITE_SUPABASE_URL': findEnv('SUPABASE_URL'),
    'VITE_SUPABASE_KEY': findEnv('SUPABASE_KEY'),
    // Public (safe to ship) VAPID key for Web Push subscriptions
    'VITE_VAPID_PUBLIC_KEY': findEnv('VAPID_PUBLIC_KEY'),
    // Public Worker URL for R2 uploads (safe to ship)
    'VITE_R2_UPLOAD_BASE_URL': findEnv('R2_UPLOAD_BASE_URL')
};

console.log("[Env Inject] Resolved Keys:", Object.keys(envVars).filter(k => envVars[k]));

const toJsStringLiteral = (value) => {
    // Produce a safe JS string literal (quoted + escaped), and strip accidental whitespace/newlines.
    return JSON.stringify(String(value ?? '').trim());
};

if (!fs.existsSync(BUILD_DIR)) fs.mkdirSync(BUILD_DIR, { recursive: true });

INPUT_FILES.forEach(file => {
    const inPath = path.join(__dirname, '..', file);
    const outPath = path.join(BUILD_DIR, file.replace(/\.js$/, '') + '.injected.js');
    if (!fs.existsSync(inPath)) {
        console.log(`[Env Inject] Skipping ${file} (not found)`);
        return;
    }

    let content = fs.readFileSync(inPath, 'utf8');
    let replacedCount = 0;

    // Direct replacement of the placeholder strings
    for (const [placeholder, value] of Object.entries(envVars)) {
        if (value) {
            let did = false;
            const safe = toJsStringLiteral(value);

            // Prefer replacing quoted placeholders, e.g. 'VITE_X' or "VITE_X"
            if (content.includes(`'${placeholder}'`)) {
                content = content.split(`'${placeholder}'`).join(safe);
                did = true;
            }
            if (content.includes(`"${placeholder}"`)) {
                content = content.split(`"${placeholder}"`).join(safe);
                did = true;
            }

            // Fallback: unquoted replacement (legacy)
            if (!did) {
            const pieces = content.split(placeholder);
            if (pieces.length > 1) {
                    content = pieces.join(String(value).trim());
                    did = true;
                }
            }

            if (did) {
                replacedCount++;
                console.log(`[Env Inject] ✅ Replaced ${placeholder} in ${file}`);
            }
        } else {
            console.log(`[Env Inject] ⚠️ No value provided for ${placeholder}`);
        }
    }

    fs.writeFileSync(outPath, content);
    if (replacedCount === 0) {
        console.log(`[Env Inject] ℹ️ No placeholders found in ${file} (wrote injected copy anyway)`);
    }
});
