import { IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';
import { Transform } from 'class-transformer';
import { RoomStatus } from '../entities/room.entity';

export class QueryRoomsDto {
  @IsOptional()
  @IsString()
  name?: string; // 房间名称

  @IsOptional()
  @IsString()
  roomCode?: string; // 房间号

  @IsOptional()
  @IsEnum(RoomStatus)
  status?: RoomStatus; // 房间状态

  @IsOptional()
  @IsDateString()
  createdAtStart?: string; // 创建时间开始

  @IsOptional()
  @IsDateString()
  createdAtEnd?: string; // 创建时间结束

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  page?: number = 1; // 页码

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  limit?: number = 10; // 每页数量

  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt'; // 排序字段

  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC' = 'DESC'; // 排序方向

  @IsOptional()
  @IsString()
  creatorUsername?: string; // 创建人用户名筛选
}
