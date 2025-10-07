import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(username: string, password: string): Promise<any> {
    const user = await this.usersService.findByUsername(username);
    
    if (user && await this.usersService.validatePassword(user, password)) {
      if (!user.isActive) {
        throw new UnauthorizedException('Account is deactivated');
      }
      
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const payload = {
      username: user.username,
      sub: user.id,
      role: user.role
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    };
  }

  async loginWithValidation(loginDto: { username: string; password: string }) {
    try {
      // 查找用户
      const user = await this.usersService.findByUsername(loginDto.username);

      if (!user) {
        return {
          success: false,
          message: '用户不存在',
          code: 'USER_NOT_FOUND'
        };
      }

      // 验证密码
      const isPasswordValid = await this.usersService.validatePassword(user, loginDto.password);
      if (!isPasswordValid) {
        return {
          success: false,
          message: '密码错误',
          code: 'INVALID_PASSWORD'
        };
      }

      // 检查用户是否激活
      if (!user.isActive) {
        return {
          success: false,
          message: '账户已被禁用',
          code: 'ACCOUNT_DEACTIVATED'
        };
      }

      // 登录成功，生成token
      const payload = {
        username: user.username,
        sub: user.id,
        role: user.role
      };

      return {
        success: true,
        access_token: this.jwtService.sign(payload),
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        message: '登录过程中发生错误，请稍后重试',
        code: 'INTERNAL_ERROR'
      };
    }
  }

  async register(registerDto: RegisterDto) {
    const user = await this.usersService.create(registerDto);
    const { password, ...result } = user;
    return result;
  }
}
