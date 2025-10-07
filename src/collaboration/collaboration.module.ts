import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollaborationGateway } from './collaboration.gateway';
import { RoomsModule } from '../rooms/rooms.module';
import { RoomMember } from '../rooms/entities/room-member.entity';

@Module({
  imports: [
    RoomsModule,
    TypeOrmModule.forFeature([RoomMember])
  ],
  providers: [CollaborationGateway],
})
export class CollaborationModule {}
