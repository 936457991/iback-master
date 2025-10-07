import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { jwtConfig } from '../../config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConfig.secret,
    });
  }

  async validate(payload: any) {
    try {
      const user = await this.usersService.findOne(payload.sub);
      
      // Check if user is active
      if (!user.isActive) {
        return null; // This will cause authentication to fail
      }
      
      return {
        id: user.id,
        username: user.username,
        role: user.role,
      };
    } catch (error) {
      // User not found (deleted) - return null to fail authentication
      return null;
    }
  }
}
