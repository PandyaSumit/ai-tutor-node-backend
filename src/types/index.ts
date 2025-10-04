import { Request } from 'express';
import { JwtPayload } from 'jsonwebtoken';

export enum UserRole {
  STUDENT = 'student',
  TUTOR = 'tutor',
  ADMIN = 'admin',
}

export interface IUser {
  _id: string;
  email: string;
  name: string;
  password?: string;
  googleId?: string;
  role: UserRole;
  isEmailVerified: boolean;
  profileImage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRefreshToken {
  _id: string;
  userId: string;
  token: string;
  deviceInfo: string;
  ipAddress: string;
  expiresAt: Date;
  createdAt: Date;
  isRevoked: boolean;
}

export interface IJWTPayload extends JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface AuthRequest extends Request {
  user?: IJWTPayload;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupCredentials {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
}

export interface GoogleProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sort?: string;
  order?: 'asc' | 'desc';
}