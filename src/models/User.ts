// src/models/User.ts
import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { UserRole, IUser } from '@/types';

export interface IUserDocument extends Omit<IUser, '_id'>, Document {
    comparePassword(candidatePassword: string): Promise<boolean>;
    isActive: boolean; // ✅ Add this
}

interface IUserModel extends Model<IUserDocument> {
    findByEmail(email: string): Promise<IUserDocument | null>;
}

const userSchema = new Schema<IUserDocument>(
    {
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
        },
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
            minlength: [2, 'Name must be at least 2 characters'],
            maxlength: [50, 'Name cannot exceed 50 characters'],
        },
        password: {
            type: String,
            select: false,
            minlength: [8, 'Password must be at least 8 characters'],
        },
        googleId: {
            type: String,
            sparse: true,
            unique: true,
        },
        role: {
            type: String,
            enum: Object.values(UserRole),
            default: UserRole.STUDENT,
        },
        isEmailVerified: {
            type: Boolean,
            default: false,
        },
        // ✅ Add isActive field
        isActive: {
            type: Boolean,
            default: true,
        },
        verificationToken: {
            type: String,
            select: false,
        },
        verificationExpires: {
            type: Date,
            select: false,
        },
        passwordResetToken: {
            type: String,
            select: false,
        },
        passwordResetExpires: {
            type: Date,
            select: false,
        },
        profileImage: {
            type: String,
        },
    },
    {
        timestamps: true,
        toJSON: {
            transform: (_, ret) => {
                if ('password' in ret) delete (ret as any).password;
                if ('__v' in ret) delete (ret as any).__v;
                return ret;
            },
        },
    }
);

userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();

    try {
        if (this.password) {
            const salt = await bcrypt.genSalt(12);
            this.password = await bcrypt.hash(this.password, salt);
        }
        next();
    } catch (error: any) {
        next(error);
    }
});

userSchema.methods.comparePassword = async function (
    candidatePassword: string
): Promise<boolean> {
    if (!this.password) return false;
    return bcrypt.compare(candidatePassword, this.password);
};

userSchema.statics.findByEmail = function (email: string) {
    return this.findOne({ email: email.toLowerCase() });
};

const User = mongoose.model<IUserDocument, IUserModel>('User', userSchema);

export default User;