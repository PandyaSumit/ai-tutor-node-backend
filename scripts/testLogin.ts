// scripts/testLogin.ts
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const PORT = process.env.PORT || 8000;
const API_URL = process.env.API_URL || `http://localhost:${PORT}`;

async function testAdminLogin() {
    try {
        console.log('🔐 Testing admin login...\n');
        console.log('API URL:', API_URL);
        console.log('Credentials:');
        console.log('  Email:', 'admin@example.com');
        console.log('  Password:', 'Admin@123');
        console.log('\n⏳ Sending login request...\n');

        const response = await axios.post(
            `${API_URL}/api/auth/login`,
            {
                email: 'admin@example.com',
                password: 'Admin@123',
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                },
                withCredentials: true,
            }
        );

        console.log('✅ Login successful!\n');
        console.log('═══════════════════════════════════════');
        console.log('User Details:');
        console.log('  ID:', response.data.data.user.id);
        console.log('  Email:', response.data.data.user.email);
        console.log('  Name:', response.data.data.user.name);
        console.log('  Role:', response.data.data.user.role);
        console.log('\nAccess Token:');
        console.log(' ', response.data.data.accessToken);
        console.log('═══════════════════════════════════════\n');

        // Test admin endpoint
        console.log('🔍 Testing admin endpoint access...\n');
        const csrfResponse = await axios.get(
            `${API_URL}/api/admin/blog/csrf-token`,
            {
                headers: {
                    Authorization: `Bearer ${response.data.data.accessToken}`,
                },
            }
        );

        console.log('✅ Admin access confirmed!');
        console.log('CSRF Token:', csrfResponse.data.data.csrfToken);
        console.log('\n🎉 All tests passed! Admin account is working correctly.\n');
    } catch (error: any) {
        console.error('❌ Login failed!');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Message:', error.response.data.message);
            console.error('\nResponse data:', JSON.stringify(error.response.data, null, 2));
            console.error('\nPossible issues:');
            console.error('  1. Server is not running on port', PORT, '(run: npm run dev)');
            console.error('  2. Admin user not created (run: npm run create-admin)');
            console.error('  3. Wrong credentials');
            console.error('  4. Database connection issue');
            console.error('  5. Check if server is running on a different port');
        } else if (error.code === 'ECONNREFUSED') {
            console.error('Error: Connection refused');
            console.error('\n❌ Cannot connect to server at', API_URL);
            console.error('\nPossible issues:');
            console.error('  1. Server is not running - Start it with: npm run dev');
            console.error('  2. Server is running on a different port');
            console.error('  3. Check your .env file for PORT setting');
        } else {
            console.error('Error:', error.message);
            console.error('Full error:', error);
        }
        process.exit(1);
    }
}

testAdminLogin();
