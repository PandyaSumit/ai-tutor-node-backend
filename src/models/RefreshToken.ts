import mongoose, { Schema, Document, Model } from 'mongoose';
import { IRefreshToken } from '../types';

export interface IRefreshTokenDocument extends Omit<IRefreshToken, '_id'>, Document {
  isExpired(): boolean;
}

interface IRefreshTokenModel extends Model<IRefreshTokenDocument> {
  findByToken(token: string): Promise<IRefreshTokenDocument | null>;
  revokeToken(token: string): Promise<void>;
  revokeAllUserTokens(userId: string): Promise<void>;
  cleanupExpiredTokens(): Promise<void>;
}

const refreshTokenSchema = new Schema<IRefreshTokenDocument>(
  {
    userId: {
      type: String,
      required: true,
      ref: 'User',
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
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
      index: true,
    },
    isRevoked: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

refreshTokenSchema.index({ userId: 1, isRevoked: 1, expiresAt: 1 });

refreshTokenSchema.methods.isExpired = function (): boolean {
  return this.expiresAt < new Date();
};

refreshTokenSchema.statics.findByToken = function (token: string) {
  return this.findOne({ token, isRevoked: false });
};

refreshTokenSchema.statics.revokeToken = async function (token: string) {
  await this.updateOne({ token }, { isRevoked: true });
};

refreshTokenSchema.statics.revokeAllUserTokens = async function (userId: string) {
  await this.updateMany({ userId }, { isRevoked: true });
};

refreshTokenSchema.statics.cleanupExpiredTokens = async function () {
  const now = new Date();
  await this.deleteMany({ expiresAt: { $lt: now } });
};

// Automatically delete expired tokens after 30 days
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 days

const RefreshToken = mongoose.model<IRefreshTokenDocument, IRefreshTokenModel>(
  'RefreshToken',
  refreshTokenSchema
);

export default RefreshToken;