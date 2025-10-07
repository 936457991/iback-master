import { IsString, IsOptional, IsEnum } from 'class-validator';
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
}
