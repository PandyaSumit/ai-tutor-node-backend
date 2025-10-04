import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { UserRole, IUser } from '../types';

export interface IUserDocument extends Omit<IUser, '_id'>, Document {
    comparePassword(candidatePassword: string): Promise<boolean>;
}

interface IUserModel extends Model<IUserDocument> {
    findByEmail(email: string): Promise<IUserDocument | null>;
}

const userSchema = new Schema<any>(
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
                if ((ret as any).password !== undefined) delete (ret as any).password;
                if ((ret as any).__v !== undefined) delete (ret as any).__v;
                return ret;
            },
        },
    }
);

// Unique/index declared on fields above (unique: true). Avoid duplicate index() calls to silence Mongoose warnings.

userSchema.pre('save', async function (next) {
    const user: any = this;
    if (typeof user.isModified === 'function' && !user.isModified('password')) return next();

    try {
        if (user.password) {
            const salt = await bcrypt.genSalt(12);
            user.password = await bcrypt.hash(user.password, salt);
        }
        next();
    } catch (error: any) {
        next(error);
    }
});

userSchema.methods.comparePassword = async function (
    candidatePassword: string
): Promise<boolean> {
    const user: any = this;
    if (!user.password) return false;
    return bcrypt.compare(candidatePassword, user.password);
};

userSchema.statics.findByEmail = function (email: string) {
    return this.findOne({ email: (email as any).toLowerCase() } as any);
};

const User = mongoose.model<IUserDocument, IUserModel>('User', userSchema);

export default User;