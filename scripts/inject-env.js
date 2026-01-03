const fs = require('fs');
const path = require('path');

const files = ['script.js', 'anticode.js'];
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
    'VITE_SUPABASE_KEY': findEnv('SUPABASE_KEY')
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
                // Do not print any portion of the value (keys/URLs may be sensitive depending on user setup).
                console.log(`[Env Inject] ✅ Replaced ${placeholder} in ${file}`);
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
