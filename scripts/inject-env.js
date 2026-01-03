const fs = require('fs');
const path = require('path');

const files = ['script.js', 'anticode.js'];
console.log("[Env Inject] Available Environment Keys:", Object.keys(process.env).filter(k => k.includes('SUPABASE') || k.includes('VITE')));

const envVars = {
    'VITE_SUPABASE_URL': process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    'VITE_SUPABASE_KEY': process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_KEY
};

console.log("[Env Inject] Resolved Keys:", Object.keys(envVars).filter(k => envVars[k]));

files.forEach(file => {
    const filePath = path.join(__dirname, '..', file);
    if (!fs.existsSync(filePath)) {
        console.log(`[Env Inject] Skipping ${file} (not found)`);
        return;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    let replacedCount = 0;

    // Direct replacement of the placeholder strings
    for (const [placeholder, value] of Object.entries(envVars)) {
        if (value) {
            // Using a simple split/join to replace all occurrences of the placeholder string
            const pieces = content.split(placeholder);
            if (pieces.length > 1) {
                content = pieces.join(value);
                replacedCount++;
                console.log(`[Env Inject] ✅ Replaced ${placeholder} in ${file} (Value: ${value.substring(0, 5)}...)`);
            }
        } else {
            console.log(`[Env Inject] ⚠️ No value provided for ${placeholder}`);
        }
    }

    if (replacedCount > 0) {
        fs.writeFileSync(filePath, content);
    } else {
        console.log(`[Env Inject] ℹ️ No placeholders found in ${file}`);
    }
});
