import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
//@ts-ignore
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();

    // 特殊处理登录相关的错误，统一返回200状态码
    const request = ctx.getRequest();
    const isLoginRequest = request.url?.includes('/auth/login');

    if (isLoginRequest) {
      // 处理验证错误
      if (exception instanceof BadRequestException) {
        const exceptionResponse = exception.getResponse() as any;
        let message = 'Validation failed';
        
        if (typeof exceptionResponse === 'object' && exceptionResponse.message) {
          message = Array.isArray(exceptionResponse.message) 
            ? exceptionResponse.message.join(', ')
            : exceptionResponse.message;
        }

        return response.status(200).json({
          success: false,
          message: message,
          code: 'VALIDATION_ERROR'
        });
      }

      // 处理其他登录相关错误
      const exceptionResponse = exception.getResponse() as any;
      let message = 'Login failed';
      
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse.message) {
        message = exceptionResponse.message;
      }

      return response.status(200).json({
        success: false,
        message: message,
        code: 'LOGIN_ERROR'
      });
    }

    // 对于非登录请求，保持原有的错误处理
    const exceptionResponse = exception.getResponse();
    
    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(typeof exceptionResponse === 'object' ? exceptionResponse : { message: exceptionResponse }),
    });
  }
}
