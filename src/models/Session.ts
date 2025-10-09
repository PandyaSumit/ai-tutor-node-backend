import mongoose, { Schema, Document } from 'mongoose';

export interface ISession extends Document {
    userId: mongoose.Types.ObjectId;
    sessionId: string;
    status: 'active' | 'paused' | 'ended';
    contextWindow: {
        messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>;
        maxTokens: number;
    };
    metadata: {
        startTime: Date;
        lastActivity: Date;
        messageCount: number;
        topic?: string;
    };
    createdAt: Date;
    updatedAt: Date;
}

const SessionSchema = new Schema<ISession>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        sessionId: { type: String, required: true, unique: true, index: true },
        status: {
            type: String,
            enum: ['active', 'paused', 'ended'],
            default: 'active',
        },
        contextWindow: {
            messages: [
                {
                    role: { type: String, enum: ['user', 'assistant'], required: true },
                    content: { type: String, required: true },
                    timestamp: { type: Date, default: Date.now },
                },
            ],
            maxTokens: { type: Number, default: 4000 },
        },
        metadata: {
            startTime: { type: Date, default: Date.now },
            lastActivity: { type: Date, default: Date.now },
            messageCount: { type: Number, default: 0 },
            topic: String,
        },
    },
    { timestamps: true }
);

SessionSchema.index({ userId: 1, status: 1 });
SessionSchema.index({ 'metadata.lastActivity': 1 });

export default mongoose.model<ISession>('Session', SessionSchema);
