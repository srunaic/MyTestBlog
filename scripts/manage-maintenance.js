const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 1. Load Environment Variables
const envPath = path.join(__dirname, '..', '.env');
const env = {};
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) env[key.trim()] = value.trim();
    });
}

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseKey = env['VITE_SUPABASE_KEY']; // Note: Service Role Key is preferred for Node scripts if RLS is enabled

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: VITE_SUPABASE_URL or VITE_SUPABASE_KEY missing in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 2. Parse Arguments
const mode = process.argv[2]; // 'ON' or 'OFF'
if (!['ON', 'OFF'].includes(mode)) {
    console.error('❌ Usage: node manage-maintenance.js [ON|OFF]');
    process.exit(1);
}

async function toggleMaintenance() {
    const status = (mode === 'ON');
    console.log(`\n⏳ Setting Maintenance Mode to: ${mode}...`);

    const { error } = await supabase
        .from('site_management')
        .update({
            is_maintenance: status,
            maintenance_message: status ? '서버 점검 중입니다. 잠시 후 상점 이용이 가능합니다.' : '',
            maintenance_schedule: status ? '예정 시간: 작업 완료 시까지' : '',
            updated_at: new Date().toISOString()
        })
        .eq('id', 1);

    if (error) {
        console.error('❌ Failed to update maintenance mode:', error.message);
        if (error.message.includes('row-level security')) {
            console.error('💡 Tip: Try using SUPABASE_SERVICE_ROLE_KEY instead of VITE_SUPABASE_KEY for Node scripts.');
        }
        process.exit(1);
    } else {
        console.log(`✅ SUCCESS: Server Maintenance is now ${mode}!`);
        console.log('브라우저에서 변경 사항을 확인하세요.\n');
        process.exit(0);
    }
}

toggleMaintenance();
