import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Room } from '../rooms/entities/room.entity';
import { RoomMember } from '../rooms/entities/room-member.entity';
import { dbConfig } from '../config';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: dbConfig.type as any,
      host: dbConfig.host,
      port: dbConfig.port,
      username: dbConfig.username,
      password: dbConfig.password,
      database: dbConfig.database,
      entities: [User, Room, RoomMember],
      synchronize: dbConfig.synchronize,
      logging: dbConfig.logging,
      charset: dbConfig.charset,
      timezone: dbConfig.timezone,
      ssl: dbConfig.ssl,
      extra: dbConfig.connectionLimit ? {
        connectionLimit: dbConfig.connectionLimit,
      } : undefined,
    } as any),
  ],
})
export class DatabaseModule {}
