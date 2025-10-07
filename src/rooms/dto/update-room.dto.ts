import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString } from 'class-validator';
import { CreateRoomDto } from './create-room.dto';

export class UpdateRoomDto extends PartialType(CreateRoomDto) {
  @IsOptional()
  @IsString()
  content?: string; // 房间内容
}
