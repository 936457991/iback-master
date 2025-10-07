import { Injectable, NotFoundException, ConflictException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RoomsService } from '../rooms/rooms.service';
import { RoomMember, RoomMemberRole } from '../rooms/entities/room-member.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(RoomMember)
    private roomMembersRepository: Repository<RoomMember>,
    @Inject(forwardRef(() => RoomsService))
    private roomsService: RoomsService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const { username, password, role, isActive } = createUserDto;

    // Check if user already exists
    const existingUser = await this.usersRepository.findOne({
      where: { username },
    });

    if (existingUser) {
      throw new ConflictException('Username already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = this.usersRepository.create({
      username,
      password: hashedPassword,
      role: role || UserRole.USER,
      isActive: isActive !== undefined ? isActive : true,
    });

    return this.usersRepository.save(user);
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({
      select: ['id', 'username', 'role', 'isActive', 'createdAt', 'updatedAt'],
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id },
      select: ['id', 'username', 'role', 'isActive', 'createdAt', 'updatedAt'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { username },
    });
  }



  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    Object.assign(user, updateUserDto);
    return this.usersRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);

    // 1. 首先获取用户创建的所有房间（用户是admin的房间）
    const userCreatedRooms = await this.roomMembersRepository.find({
      where: {
        userId: id,
        role: RoomMemberRole.ADMIN
      },
      relations: ['room']
    });

    console.log(`🗑️ User ${user.username} has ${userCreatedRooms.length} created rooms to delete`);

    // 2. 删除用户创建的每个房间，包括通知在线用户
    for (const roomMember of userCreatedRooms) {
      const roomId = roomMember.room.id;
      try {
        console.log(`🗑️ Deleting room ${roomMember.room.name} (${roomId}) created by user ${user.username}`);
        
        // 使用RoomsService的remove方法删除房间，这会自动处理通知在线用户
        await this.roomsService.remove(roomId, id, UserRole.ADMIN);
        
        console.log(`✅ Successfully deleted room ${roomMember.room.name}`);
      } catch (error) {
        console.error(`❌ Error deleting room ${roomId}:`, error);
        // 继续删除其他房间，不因为单个房间删除失败而停止
      }
    }

    // 3. 删除用户作为成员参与的其他房间的记录
    const userMemberRecords = await this.roomMembersRepository.find({
      where: { userId: id }
    });

    if (userMemberRecords.length > 0) {
      console.log(`🗑️ Removing user ${user.username} from ${userMemberRecords.length} room member records`);
      await this.roomMembersRepository.remove(userMemberRecords);
    }

    // 4. 最后删除用户
    console.log(`🗑️ Deleting user ${user.username}`);
    await this.usersRepository.remove(user);
    
    console.log(`✅ Successfully deleted user ${user.username} and all associated rooms`);
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password);
  }

  async createDefaultAdmin(): Promise<void> {
    try {
      // Check if admin user already exists
      const adminExists = await this.usersRepository.findOne({
        where: { username: 'admin' }
      });

      if (!adminExists) {
        // Hash password
        const hashedPassword = await bcrypt.hash('admin123', 10);

        // Create admin user
        const admin = this.usersRepository.create({
          username: 'admin',
          password: hashedPassword,
          role: UserRole.ADMIN,
          isActive: true,
        });

        await this.usersRepository.save(admin);
        console.log('✅ Default admin user created: admin / admin123');
      } else {
        console.log('ℹ️  Default admin user already exists');
      }
    } catch (error) {
      console.error('❌ Failed to create default admin user:', error);
    }
  }
}
