import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';
import { Room } from './entities/room.entity';
import { RoomMember } from './entities/room-member.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Room, RoomMember]),
    forwardRef(() => import('../users/users.module').then(m => m.UsersModule)),
  ],
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
