const fs = require('fs');
const path = require('path');

const files = ['script.js', 'anticode.js'];
const envVars = {
    'VITE_SUPABASE_URL': process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    'VITE_SUPABASE_KEY': process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_KEY
};

files.forEach(file => {
    const filePath = path.join(__dirname, '..', file);
    if (!fs.existsSync(filePath)) {
        console.log(`[Env Inject] Skipping ${file} (not found)`);
        return;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    let replacedCount = 0;

    for (const [key, value] of Object.entries(envVars)) {
        if (value) {
            const regex = new RegExp(`(['"])${key}(['"])`, 'g');
            if (content.match(regex)) {
                content = content.replace(regex, `$1${value}$2`);
                replacedCount++;
                console.log(`[Env Inject] ✅ Injected ${key} into ${file} (Value starts with: ${value.substring(0, 5)}...)`);
            }
        } else {
            console.log(`[Env Inject] ⚠️ Missing value for ${key}`);
        }
    }

    if (replacedCount > 0) {
        fs.writeFileSync(filePath, content);
    } else {
        console.log(`[Env Inject] ℹ️ No placeholders found in ${file}`);
    }
});
