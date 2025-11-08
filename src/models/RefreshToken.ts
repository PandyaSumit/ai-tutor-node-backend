// src/models/RefreshToken.ts - Updated with session support
import mongoose, { Schema, Document, Model } from 'mongoose';
import { IRefreshToken } from '@/types';

export interface IRefreshTokenDocument extends Omit<IRefreshToken, '_id'>, Document {
    isExpired(): boolean;
}

interface IRefreshTokenModel extends Model<IRefreshTokenDocument> {
    findByToken(token: string, session?: mongoose.ClientSession): Promise<IRefreshTokenDocument | null>;
    revokeToken(token: string, session?: mongoose.ClientSession): Promise<void>;
    revokeAllUserTokens(userId: string, session?: mongoose.ClientSession): Promise<void>;
    cleanupExpiredTokens(): Promise<{ deletedCount: number }>;
}

const refreshTokenSchema = new Schema<IRefreshTokenDocument>(
    {
        userId: {
            type: String,
            required: true,
            ref: 'User',
            index: true, // ✅ Index for faster queries
        },
        token: {
            type: String,
            required: true,
            unique: true,
            index: true, // ✅ Index for faster lookups
        },
        deviceInfo: {
            type: String,
            required: true,
            default: 'Unknown Device',
        },
        ipAddress: {
            type: String,
            required: true,
        },
        expiresAt: {
            type: Date,
            required: true,
            index: true, // ✅ Index for cleanup queries
        },
        isRevoked: {
            type: Boolean,
            default: false,
            index: true, // ✅ Index for filtering active tokens
        },
    },
    {
        timestamps: true,
    }
);

// ✅ Compound index for efficient queries
refreshTokenSchema.index({ userId: 1, isRevoked: 1, expiresAt: 1 });
refreshTokenSchema.index({ token: 1, isRevoked: 1 }); // For findByToken optimization

// ✅ Instance method to check if token is expired
refreshTokenSchema.methods.isExpired = function (): boolean {
    return this.expiresAt < new Date();
};

// ✅ Static method with session support
refreshTokenSchema.statics.findByToken = function (
    token: string,
    session?: mongoose.ClientSession
): Promise<IRefreshTokenDocument | null> {
    const query = this.findOne({ token, isRevoked: false });

    if (session) {
        return query.session(session).exec();
    }

    return query.exec();
};

// ✅ Static method with session support
refreshTokenSchema.statics.revokeToken = async function (
    token: string,
    session?: mongoose.ClientSession
): Promise<void> {
    const updateOptions = session ? { session } : {};
    await this.updateOne({ token }, { isRevoked: true }, updateOptions);
};

// ✅ Static method with session support
refreshTokenSchema.statics.revokeAllUserTokens = async function (
    userId: string,
    session?: mongoose.ClientSession
): Promise<void> {
    const updateOptions = session ? { session } : {};
    await this.updateMany({ userId, isRevoked: false }, { isRevoked: true }, updateOptions);
};

// ✅ Cleanup method (no session needed - runs as background job)
refreshTokenSchema.statics.cleanupExpiredTokens = async function (): Promise<{ deletedCount: number }> {
    const now = new Date();

    // Delete tokens that are either expired or revoked for more than 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.deleteMany({
        $or: [
            { expiresAt: { $lt: now } },
            {
                isRevoked: true,
                updatedAt: { $lt: thirtyDaysAgo }
            }
        ]
    });

    return { deletedCount: result.deletedCount || 0 };
};

// ✅ Automatically delete expired tokens after 30 days (MongoDB TTL index)
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 days

const RefreshToken = mongoose.model<IRefreshTokenDocument, IRefreshTokenModel>(
    'RefreshToken',
    refreshTokenSchema
);

export default RefreshToken;