import nodemailer from 'nodemailer';
import config from '../config/env';

const transporter = nodemailer.createTransport({
    host: config.mailer.host,
    port: config.mailer.port,
    secure: config.mailer.secure,
    auth: {
        user: config.mailer.user,
        pass: config.mailer.pass,
    },
});

export async function sendVerificationEmail(to: string, token: string) {
    const verifyUrl = `${config.frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;

    const html = `
    <p>Please verify your email by clicking the link below:</p>
    <a href="${verifyUrl}">Verify Email</a>
    <p>If you did not sign up, ignore this email.</p>
  `;

    await transporter.sendMail({
        from: config.mailer.from,
        to,
        subject: 'Verify your email',
        html,
    });
}

export async function sendPasswordResetEmail(to: string, token: string) {
    const resetUrl = `${config.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;

    const html = `
    <p>Click the link below to reset your password:</p>
    <a href="${resetUrl}">Reset Password</a>
    <p>If you did not request a password reset, ignore this email.</p>
  `;

    await transporter.sendMail({
        from: config.mailer.from,
        to,
        subject: 'Reset your password',
        html,
    });
}

export default transporter;
