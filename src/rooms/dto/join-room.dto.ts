import { IsString, IsOptional, IsEnum } from 'class-validator';
import { RoomMemberRole } from '../entities/room-member.entity';

export class JoinRoomDto {
  @IsString()
  roomId: string;

  @IsOptional()
  @IsEnum(RoomMemberRole)
  role?: RoomMemberRole;
}

export class JoinRoomByCodeDto {
  @IsString()
  roomCode: string; // 6位房间号

  @IsOptional()
  @IsString()
  password?: string; // 房间密码（如果房间有密码）

  @IsOptional()
  @IsEnum(RoomMemberRole)
  role?: RoomMemberRole;
}
