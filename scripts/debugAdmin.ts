// scripts/debugAdmin.ts
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import User from '../src/models/User';

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-tutor';

async function debugAdmin() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        console.log('📍 URI:', MONGODB_URI);
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        console.log('🔍 Searching for admin user...\n');

        // Find admin user
        const admin = await User.findOne({ email: 'admin@example.com' }).select('+password');

        if (!admin) {
            console.log('❌ Admin user not found in database!');
            console.log('\nTrying alternative searches:');

            // Try finding all users
            const allUsers = await User.find({});
            console.log(`\nTotal users in database: ${allUsers.length}`);

            if (allUsers.length > 0) {
                console.log('\nAll users:');
                allUsers.forEach((u, i) => {
                    console.log(`${i + 1}. Email: ${u.email}, Name: ${u.name}, Role: ${u.role}`);
                });
            }
        } else {
            console.log('✅ Admin user found!\n');
            console.log('═══════════════════════════════════════');
            console.log('User Details:');
            console.log('  ID:       ', admin._id);
            console.log('  Email:    ', admin.email);
            console.log('  Name:     ', admin.name);
            console.log('  Role:     ', admin.role);
            console.log('  Active:   ', admin.isActive);
            console.log('  Verified: ', admin.isEmailVerified);
            console.log('  Has Password:', !!admin.password);
            console.log('  Password Hash:', admin.password?.substring(0, 30) + '...');
            console.log('═══════════════════════════════════════\n');

            // Test password comparison
            console.log('🔐 Testing password comparison...\n');
            const testPassword = 'Admin@123';

            if (admin.password) {
                // Test with bcrypt directly
                const directCompare = await bcrypt.compare(testPassword, admin.password);
                console.log('  Direct bcrypt.compare result:', directCompare);

                // Test with model method
                const methodCompare = await admin.comparePassword(testPassword);
                console.log('  Model method result:', methodCompare);

                if (directCompare && methodCompare) {
                    console.log('\n✅ Password comparison works correctly!');
                    console.log('   The issue must be elsewhere in the login flow.');
                } else {
                    console.log('\n❌ Password comparison failed!');
                    console.log('   This explains the login error.');
                }
            }
        }

        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from MongoDB');
    } catch (error) {
        console.error('❌ Error:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

debugAdmin();
