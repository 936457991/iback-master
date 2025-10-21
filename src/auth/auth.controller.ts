import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @UseGuards(RateLimitGuard) // 🛡️ 添加请求频率限制：30分钟内最多5次登录尝试
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    try {
      const result = await this.authService.loginWithValidation(loginDto);
      return result;
    } catch (error) {
      // 捕获所有错误，包括验证错误，统一返回200状态码
      if (error.response && error.response.message) {
        // 处理验证错误
        const message = Array.isArray(error.response.message)
          ? error.response.message.join(', ')
          : error.response.message;

        return {
          success: false,
          message: message,
          code: 'VALIDATION_ERROR'
        };
      }

      // 处理其他错误
      return {
        success: false,
        message: error.message || '登录过程中发生错误',
        code: 'INTERNAL_ERROR'
      };
    }
  }

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }
}
