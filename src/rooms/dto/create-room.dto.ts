import { IsString, IsOptional, IsEnum, IsUrl, MaxLength, IsDateString } from 'class-validator';
import { RoomStatus } from '../entities/room.entity';

export class CreateRoomDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  password?: string; // 房间密码（可选）

  @IsOptional()
  @IsEnum(RoomStatus)
  status?: RoomStatus;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @MaxLength(2048)
  @IsUrl(
    { require_protocol: true },
    { message: 'coderpadUrl must be a valid URL with protocol (e.g. https://...)' },
  )
  coderpadUrl?: string | null;

  // 代码链接到期时间（日期/时间）。不传则默认创建时 +2 天
  @IsOptional()
  @IsDateString()
  coderpadExpiresAt?: string | null;

  // 系统设计链接（可选）
  @IsOptional()
  @MaxLength(2048)
  @IsUrl(
    { require_protocol: true },
    { message: 'systemDesignUrl must be a valid URL with protocol (e.g. https://...)' },
  )
  systemDesignUrl?: string | null;
}
