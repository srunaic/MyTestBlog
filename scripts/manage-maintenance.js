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
const mode = process.argv[2]; // 'ON', 'OFF', or 'EXTEND'
if (!['ON', 'OFF', 'EXTEND'].includes(mode)) {
    console.error('❌ Usage: node manage-maintenance.js [ON|OFF|EXTEND] "schedule_string"');
    process.exit(1);
}

// 3. Get optional schedule argument (for ON and EXTEND)
const customSchedule = process.argv[3] || '예정 시간: 작업 완료 시까지';

async function toggleMaintenance() {
    const isMaintenanceMode = (mode === 'ON' || mode === 'EXTEND');
    console.log(`\n⏳ Setting Maintenance Mode to: ${mode}...`);

    let updateData = {};
    if (mode === 'ON') {
        updateData = {
            is_maintenance: true,
            maintenance_message: '서버 점검 중입니다. 서비스 이용에 불편을 드려 죄송합니다.',
            maintenance_schedule: customSchedule,
            updated_at: new Date().toISOString()
        };
    } else if (mode === 'EXTEND') {
        updateData = {
            is_maintenance: true,
            maintenance_message: '서버 점검 시간이 연장되었습니다. 양해 부탁드립니다.',
            maintenance_schedule: customSchedule,
            updated_at: new Date().toISOString()
        };
    } else {
        updateData = {
            is_maintenance: false,
            maintenance_message: '',
            maintenance_schedule: '',
            updated_at: new Date().toISOString()
        };
    }

    const { error } = await supabase
        .from('site_management')
        .update(updateData)
        .eq('id', 1);

    if (error) {
        console.error('❌ Failed to update maintenance mode:', error.message);
        if (error.message.includes('row-level security')) {
            console.error('💡 Tip: Try using SUPABASE_SERVICE_ROLE_KEY instead of VITE_SUPABASE_KEY for Node scripts.');
        }
        setTimeout(() => process.exit(1), 500);
    } else {
        console.log(`✅ SUCCESS: Server Maintenance is now ${mode}!`);
        if (isMaintenanceMode) {
            console.log(`📅 Schedule set to: ${customSchedule}`);
        }
        console.log('브라우저에서 변경 사항을 확인하세요.\n');
        setTimeout(() => process.exit(0), 500);
    }
}

toggleMaintenance();
