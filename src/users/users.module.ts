import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { RoomMember } from '../rooms/entities/room-member.entity';
import { RoomsModule } from '../rooms/rooms.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RoomMember]),
    forwardRef(() => RoomsModule),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
