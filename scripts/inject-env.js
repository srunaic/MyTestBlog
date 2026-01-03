const fs = require('fs');
const path = require('path');

const files = ['script.js', 'anticode.js'];
const envVars = {
    'VITE_SUPABASE_URL': process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    'VITE_SUPABASE_KEY': process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_KEY
};

files.forEach(file => {
    const filePath = path.join(__dirname, '..', file);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');
    let replaced = false;

    for (const [key, value] of Object.entries(envVars)) {
        if (value && content.includes(key)) {
            // Replace strings like 'VITE_SUPABASE_URL' or "VITE_SUPABASE_URL"
            // specifically targeting the constant assignments
            const regex = new RegExp(`(['"])${key}(['"])`, 'g');
            content = content.replace(regex, `$1${value}$2`);
            replaced = true;
            console.log(`Replaced ${key} in ${file}`);
        }
    }

    if (replaced) {
        fs.writeFileSync(filePath, content);
    }
});
