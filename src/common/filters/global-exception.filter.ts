import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
//@ts-ignore

import { Request, Response } from 'express';
import { CustomLoggerService } from '../logger/logger.service';

@Injectable()
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: CustomLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string;
    let details: any = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        message = (exceptionResponse as any).message || exception.message;
        details = exceptionResponse;
      } else {
        message = exception.message;
      }
    } else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = exception.message || 'Internal server error';
      
      // Log the full error for debugging
      this.logger.logError(
        'Unhandled error occurred',
        exception,
        {
          url: request.url,
          method: request.method,
          userAgent: request.get('User-Agent'),
          ip: request.ip,
        },
        'GlobalExceptionFilter'
      );
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Unknown error occurred';
      
      this.logger.logError(
        'Unknown exception occurred',
        new Error(String(exception)),
        {
          url: request.url,
          method: request.method,
          exception: String(exception),
        },
        'GlobalExceptionFilter'
      );
    }

    // Log the exception (except for common HTTP errors like 404, 400)
    if (status >= 500) {
      this.logger.logError(
        `HTTP ${status} Error: ${message}`,
        exception instanceof Error ? exception : new Error(String(exception)),
        {
          url: request.url,
          method: request.method,
          statusCode: status,
          userAgent: request.get('User-Agent'),
          ip: request.ip,
        },
        'GlobalExceptionFilter'
      );
    } else if (status >= 400) {
      this.logger.logWarning(
        `HTTP ${status} Error: ${message}`,
        {
          url: request.url,
          method: request.method,
          statusCode: status,
          userAgent: request.get('User-Agent'),
          ip: request.ip,
        },
        'GlobalExceptionFilter'
      );
    }

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      ...(details && { details }),
    };

    response.status(status).json(errorResponse);
  }
}
