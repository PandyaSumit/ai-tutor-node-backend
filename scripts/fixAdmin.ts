// scripts/fixAdmin.ts - Delete and recreate admin user with correct password
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import User from '../src/models/User';

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-tutor';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'Admin@123';
const ADMIN_NAME = 'Admin User';

async function fixAdmin() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        console.log('📍 URI:', MONGODB_URI);
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Find existing admin
        console.log('🔍 Searching for existing admin user...\n');
        const existingAdmin = await User.findOne({ email: ADMIN_EMAIL }).select('+password');

        if (existingAdmin) {
            console.log('⚠️  Found existing admin user:');
            console.log('  ID:', existingAdmin._id);
            console.log('  Email:', existingAdmin.email);
            console.log('  Name:', existingAdmin.name);
            console.log('  Role:', existingAdmin.role);
            console.log('  Has Password:', !!existingAdmin.password);

            if (existingAdmin.password) {
                console.log('\n🔐 Testing password comparison...');
                const isMatch = await bcrypt.compare(ADMIN_PASSWORD, existingAdmin.password);
                console.log('  Password matches:', isMatch);

                if (isMatch) {
                    console.log('\n✅ Password is correct! The admin user is working.');
                    console.log('   The login issue must be something else.');
                    console.log('\n💡 Possible issues:');
                    console.log('   1. Server is running on wrong port (check npm run dev output)');
                    console.log('   2. CORS issue');
                    console.log('   3. JWT secret mismatch');
                    await mongoose.disconnect();
                    return;
                }
            }

            console.log('\n🗑️  Deleting existing admin user...');
            await User.deleteOne({ email: ADMIN_EMAIL });
            console.log('✅ Deleted\n');
        } else {
            console.log('ℹ️  No existing admin user found\n');
        }

        // Create new admin with correct password
        console.log('👤 Creating new admin user...\n');

        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, salt);

        const admin = await User.create({
            email: ADMIN_EMAIL,
            name: ADMIN_NAME,
            password: hashedPassword,
            role: 'admin',
            isActive: true,
            isEmailVerified: true,
        });

        console.log('✅ Admin user created successfully!\n');
        console.log('═══════════════════════════════════════');
        console.log('Admin Details:');
        console.log('  📧 Email:    ', admin.email);
        console.log('  🔑 Password: ', ADMIN_PASSWORD);
        console.log('  👤 Name:     ', admin.name);
        console.log('  🔐 Role:     ', admin.role);
        console.log('  ✓  Active:   ', admin.isActive);
        console.log('  ✓  Verified: ', admin.isEmailVerified);
        console.log('  🆔 ID:       ', admin._id);
        console.log('═══════════════════════════════════════\n');

        // Verify password immediately
        console.log('🔐 Verifying password...');
        const verifyUser = await User.findOne({ email: ADMIN_EMAIL }).select('+password');
        if (verifyUser && verifyUser.password) {
            const isMatch = await bcrypt.compare(ADMIN_PASSWORD, verifyUser.password);
            console.log('  Password verification:', isMatch ? '✅ SUCCESS' : '❌ FAILED');

            if (!isMatch) {
                console.log('\n⚠️  WARNING: Password verification failed!');
                console.log('   This is a critical issue.');
            } else {
                console.log('\n✅ Admin user is ready to use!');
                console.log('\n📝 Next steps:');
                console.log('   1. Make sure your server is running: npm run dev');
                console.log('   2. Check what port it\'s running on');
                console.log('   3. Run: npm run test-login');
            }
        }

        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from MongoDB');
    } catch (error) {
        console.error('\n❌ Error:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

fixAdmin();
