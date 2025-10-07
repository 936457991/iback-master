import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { JoinRoomDto, JoinRoomByCodeDto } from './dto/join-room.dto';
import { QueryRoomsDto } from './dto/query-rooms.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  create(@Body() createRoomDto: CreateRoomDto, @Request() req) {
    return this.roomsService.create(createRoomDto, req.user.id);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  findAll() {
    return this.roomsService.findAll();
  }

  @Get('search')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  searchRooms(@Query() queryDto: QueryRoomsDto) {
    return this.roomsService.findAllWithQuery(queryDto);
  }

  @Get('my-rooms')
  findMyRooms(@Request() req, @Query('type') type?: string) {
    const userId = req.user.id;

    switch (type) {
      case 'created':
        return this.roomsService.findUserCreatedRooms(userId);
      case 'history':
        return this.roomsService.findUserHistory(userId);
      default:
        return this.roomsService.findUserRooms(userId);
    }
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.roomsService.findOne(id);
  }

  @Get('code/:roomCode')
  findByRoomCode(@Param('roomCode') roomCode: string) {
    return this.roomsService.findByRoomCode(roomCode);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateRoomDto: UpdateRoomDto,
    @Request() req,
  ) {
    return this.roomsService.update(id, updateRoomDto, req.user.id, req.user.role);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.roomsService.remove(id, req.user.id, req.user.role);
  }

  @Post('join')
  joinRoom(@Body() joinRoomDto: JoinRoomDto, @Request() req) {
    return this.roomsService.joinRoom(joinRoomDto, req.user.id);
  }

  @Post('join-by-code')
  joinRoomByCode(@Body() joinRoomByCodeDto: JoinRoomByCodeDto, @Request() req) {
    return this.roomsService.joinRoomByCode(joinRoomByCodeDto, req.user.id);
  }

  @Post(':id/leave')
  leaveRoom(@Param('id') roomId: string, @Request() req) {
    return this.roomsService.leaveRoom(roomId, req.user.id);
  }

  @Post(':id/end')
  endRoom(@Param('id') roomId: string, @Request() req) {
    return this.roomsService.endRoom(roomId, req.user.id, req.user.role);
  }
}
