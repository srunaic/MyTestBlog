const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load .env manually if dotenv isn't installed
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
}

console.log('🚀 Starting Virtual Server Verification Flow...');

try {
    // 1. Build & Inject
    console.log('📦 Building and injecting environment variables...');
    execSync('npm run build', { stdio: 'inherit' });

    // 2. Start Local Server on public/
    console.log('🌐 Starting local server on port 9000...');
    const server = spawn('npx', ['-y', 'serve', 'public', '-l', '9000'], {
        stdio: 'inherit',
        shell: true
    });

    // 3. Start Tunnel
    console.log('🔗 Creating HTTPS tunnel via localtunnel...');
    const tunnel = spawn('npx', ['-y', 'localtunnel', '--port', '9000'], {
        stdio: 'pipe',
        shell: true
    });

    let tunnelPassword = '';
    try {
        tunnelPassword = execSync('curl -s https://loca.lt/mytunnelpassword').toString().trim();
    } catch (e) {
        // Fallback for some windows environments
        try {
            tunnelPassword = execSync('powershell -Command "(Invoke-WebRequest -Uri https://loca.lt/mytunnelpassword).Content"').toString().trim();
        } catch (e2) { }
    }

    tunnel.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('your url is:')) {
            const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.loca\.lt/);
            const tunnelUrl = urlMatch ? urlMatch[0] : null;

            if (tunnelUrl) {
                console.log(`\n💉 Injecting Tunnel URL [${tunnelUrl}] into build...`);
                // Set the environment variable for the sub-process
                process.env.VITE_TUNNEL_URL = tunnelUrl;
                try {
                    // Just run the full build script again - it's safer and cleaner
                    execSync('npm run build', { stdio: 'inherit', env: process.env });
                    console.log('✅ Re-build with tunnel URL complete!');
                } catch (e) {
                    console.warn('⚠️ Re-build failed, but server continues:', e.message);
                }
            }

            console.log('\n=========================================');
            console.log('✅ VIRTUAL SERVER IS LIVE!');
            console.log(output.trim());
            if (tunnelPassword) {
                console.log(`🔑 Tunnel Password: ${tunnelPassword}`);
            }
            console.log('=========================================\n');
            console.log('사용 방법:');
            console.log('1. 위 URL을 브라우저나 모바일 기기에서 엽니다.');
            if (tunnelPassword) {
                console.log(`2. "Tunnel Password" 칸에 [ ${tunnelPassword} ] 를 입력하고 Submit을 누르세요.`);
                console.log('3. "관리자 테스트 서버" 버튼이 위 URL로 연결되는지 확인하세요.');
                console.log('4. [DEPLOY] 소스코드를 서버에 올리려면 키보드에서 [ G ] 키를 누르세요.');
                console.log('5. 테스트 완료 후 이 터미널을 종료(Ctrl+C)하세요.\n');
            } else {
                console.log('2. "관리자 테스트 서버" 버튼이 위 URL로 연결되는지 확인하세요.');
                console.log('3. [DEPLOY] 소스코드를 서버에 올리려면 키보드에서 [ G ] 키를 누르세요.');
                console.log('4. 테스트 완료 후 이 터미널을 종료(Ctrl+C)하세요.\n');
            }
        }
    });

    // Listen for Git deployment key
    if (process.stdin.setRawMode) {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (key) => {
            if (key.toLowerCase() === 'g') {
                console.log('\n\n🚀 Starting Git Deployment...');
                try {
                    const commitMsg = `Deploy via Virtual Server - ${new Date().toLocaleString()}`;
                    console.log('📝 Adding changes...');
                    execSync('git add .', { stdio: 'inherit' });
                    console.log(`Commit message: "${commitMsg}"`);
                    execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });
                    console.log('📤 Pushing to GitHub...');
                    execSync('git push', { stdio: 'inherit' });
                    console.log('\n✅ DEPLOYMENT SUCCESSFUL!');
                    console.log('이제 정식 서버에서 변경 사항을 확인하실 수 있습니다.\n');
                } catch (e) {
                    console.error('\n❌ Deployment failed:', e.message);
                }
            }
            // Ctrl+C to exit
            if (key === '\u0003') {
                process.emit('SIGINT');
            }
        });
    }

    process.on('SIGINT', () => {
        server.kill();
        tunnel.kill();
        process.exit();
    });

} catch (error) {
    console.error('❌ Failed to start test server:', error.message);
    process.exit(1);
}
