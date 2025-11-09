// scripts/createAdmin.ts
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import User from '../src/models/User';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-tutor';

// Admin user details
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'Admin@123';
const ADMIN_NAME = 'Admin User';

async function createAdminUser() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Check if admin already exists
        const existingAdmin = await User.findOne({ email: ADMIN_EMAIL });

        if (existingAdmin) {
            console.log('⚠️  Admin user already exists!');
            console.log('📧 Email:', ADMIN_EMAIL);
            console.log('👤 Name:', existingAdmin.name);
            console.log('🔐 Role:', existingAdmin.role);
            console.log('\nIf you want to reset the password, delete this user first.');
            await mongoose.disconnect();
            process.exit(0);
        }

        // Create admin user (password will be hashed by the User model's pre-save hook)
        console.log('👤 Creating admin user...');
        const admin = await User.create({
            email: ADMIN_EMAIL,
            name: ADMIN_NAME,
            password: ADMIN_PASSWORD, // Plain text - model will hash it
            role: 'admin',
            isActive: true,
            isEmailVerified: true,
        });

        console.log('\n✅ Admin user created successfully!\n');
        console.log('═══════════════════════════════════════');
        console.log('📧 Email:    ', ADMIN_EMAIL);
        console.log('🔑 Password: ', ADMIN_PASSWORD);
        console.log('👤 Name:     ', ADMIN_NAME);
        console.log('🔐 Role:     ', admin.role);
        console.log('🆔 ID:       ', admin._id);
        console.log('═══════════════════════════════════════\n');

        console.log('You can now login with these credentials!\n');

        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating admin user:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

createAdminUser();
