
// src/models/Message.ts
import mongoose, { Schema, Document } from 'mongoose';

// Base interface for message data structure (without _id for Mongoose compatibility)
interface IMessageBase {
    sessionId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: {
        latency?: number;
        llmModel?: string;
        tokens?: number;
        confidence?: number;
    };
}

// Mongoose document interface (extends Document which includes _id)
export interface IMessage extends IMessageBase, Document {
    createdAt: Date;
    updatedAt: Date;
}

// Plain object type for returned data (with explicit _id)
export interface IMessageData extends IMessageBase {
    _id: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
    {
        sessionId: { type: Schema.Types.ObjectId, ref: 'Session', required: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        role: {
            type: String,
            enum: ['user', 'assistant', 'system'],
            required: true
        },
        content: { type: String, required: true },
        metadata: {
            latency: Number,
            llmModel: String,
            tokens: Number,
            confidence: Number
        }
    },
    { timestamps: true }
);

// Compound index for efficient queries
MessageSchema.index({ sessionId: 1, createdAt: -1 });
MessageSchema.index({ userId: 1, createdAt: -1 });
MessageSchema.index({ content: 'text' });
MessageSchema.index({ userId: 1, sessionId: 1, createdAt: -1 });

export default mongoose.model<IMessage>('Message', MessageSchema);