import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsBoolean, IsString, MinLength, IsEnum } from 'class-validator';
import { CreateUserDto } from './create-user.dto';
import { UserRole } from '../entities/user.entity';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional()
  @IsString()
  @MinLength(3)
  username?: string;



  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
