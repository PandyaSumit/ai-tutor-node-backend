import { Response } from 'express';
import { ApiResponse } from '../types';

class ApiResponseHelper {
  success<T>(res: Response, message: string, data?: T, statusCode: number = 200): void {
    const response: ApiResponse<T> = {
      success: true,
      message,
      data,
    };
    res.status(statusCode).json(response);
  }

  error(res: Response, message: string, statusCode: number = 500, error?: string): void {
    const response: ApiResponse = {
      success: false,
      message,
      error,
    };
    res.status(statusCode).json(response);
  }

  created<T>(res: Response, message: string, data?: T): void {
    this.success(res, message, data, 201);
  }

  badRequest(res: Response, message: string, error?: string): void {
    this.error(res, message, 400, error);
  }

  unauthorized(res: Response, message: string = 'Unauthorized'): void {
    this.error(res, message, 401);
  }

  forbidden(res: Response, message: string = 'Forbidden'): void {
    this.error(res, message, 403);
  }

  notFound(res: Response, message: string = 'Resource not found'): void {
    this.error(res, message, 404);
  }

  conflict(res: Response, message: string): void {
    this.error(res, message, 409);
  }

  validationError(res: Response, message: string, errors?: any): void {
    const response: ApiResponse = {
      success: false,
      message,
      error: errors,
    };
    res.status(422).json(response);
  }

  serverError(res: Response, message: string = 'Internal server error'): void {
    this.error(res, message, 500);
  }
}

export default new ApiResponseHelper();