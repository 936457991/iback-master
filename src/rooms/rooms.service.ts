import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like, Between, FindManyOptions } from 'typeorm';
import { Room, RoomStatus } from './entities/room.entity';
import { RoomMember, RoomMemberRole } from './entities/room-member.entity';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { JoinRoomDto, JoinRoomByCodeDto } from './dto/join-room.dto';
import { QueryRoomsDto } from './dto/query-rooms.dto';
import { UserRole } from '../users/entities/user.entity';
import { CustomLoggerService } from '../common/logger/logger.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class RoomsService {
  private collaborationGateway: any;

  constructor(
    @InjectRepository(Room)
    private roomsRepository: Repository<Room>,
    @InjectRepository(RoomMember)
    private roomMembersRepository: Repository<RoomMember>,
    private readonly logger: CustomLoggerService,
  ) {}

  // 设置CollaborationGateway的引用（避免循环依赖）
  setCollaborationGateway(gateway: any) {
    this.collaborationGateway = gateway;
  }

  // 为房间添加创建人信息
  private addCreatorInfoToRooms(rooms: Room[]): Room[] {
    return rooms.map(room => {
      const creator = room.members?.find(member => member.role === RoomMemberRole.ADMIN);
      return {
        ...room,
        creator: creator ? {
          id: creator.user.id,
          username: creator.user.username
        } : null
      };
    });
  }

  // 生成6位房间号
  private async generateRoomCode(): Promise<string> {
    let roomCode: string;
    let isUnique = false;

    while (!isUnique) {
      // 生成6位数字房间号
      roomCode = Math.floor(100000 + Math.random() * 900000).toString();

      // 检查是否已存在
      const existingRoom = await this.roomsRepository.findOne({
        where: { roomCode }
      });

      if (!existingRoom) {
        isUnique = true;
      }
    }

    return roomCode;
  }

  async create(createRoomDto: CreateRoomDto, creatorId: string): Promise<Room> {
    const roomCode = await this.generateRoomCode();

    // 如果有密码，进行加密
    let hashedPassword = null;
    if (createRoomDto.password) {
      hashedPassword = await bcrypt.hash(createRoomDto.password, 10);
    }

    const room = this.roomsRepository.create({
      ...createRoomDto,
      roomCode,
      password: hashedPassword,
    });
    const savedRoom = await this.roomsRepository.save(room);

    // Add creator as admin
    const roomMember = this.roomMembersRepository.create({
      userId: creatorId,
      roomId: savedRoom.id,
      role: RoomMemberRole.ADMIN,
    });
    await this.roomMembersRepository.save(roomMember);

    return this.findOne(savedRoom.id);
  }

  async findAll(): Promise<Room[]> {
    const rooms = await this.roomsRepository.find({
      relations: ['members', 'members.user'],
      select: {
        members: {
          id: true,
          role: true,
          isOnline: true,
          joinedAt: true,
          user: {
            id: true,
            username: true,
          },
        },
      },
    });

    // 添加基于Socket的在线数量和更新成员在线状态
    let processedRooms = rooms;
    if (this.collaborationGateway) {
      const onlineCounts = this.collaborationGateway.getAllRoomsOnlineCount();
      processedRooms = rooms.map(room => {
        const actualOnlineUserIds = this.collaborationGateway.getOnlineUserIdsInRoom(room.id);
        const updatedMembers = room.members.map(member => ({
          ...member,
          isOnline: actualOnlineUserIds.includes(member.user.id),
        }));

        return {
          ...room,
          members: updatedMembers,
          onlineCount: onlineCounts.get(room.id) || 0,
        };
      });
    }

    // 添加创建人信息
    return this.addCreatorInfoToRooms(processedRooms);
  }

  async findAllWithQuery(queryDto: QueryRoomsDto): Promise<{ rooms: Room[], total: number }> {
    const { 
      name, 
      roomCode, 
      status, 
      createdAtStart, 
      createdAtEnd, 
      creatorUsername,
      page = 1, 
      limit = 10, 
      sortBy = 'createdAt', 
      sortOrder = 'DESC' 
    } = queryDto;

    const skip = (page - 1) * limit;

    let queryBuilder = this.roomsRepository.createQueryBuilder('room')
      .leftJoinAndSelect('room.members', 'member')
      .leftJoinAndSelect('member.user', 'user')
      .select([
        'room.id',
        'room.name', 
        'room.description',
        'room.roomCode',
        'room.password',
        'room.status',
        'room.language',
        'room.createdAt',
        'room.updatedAt',
        'member.id',
        'member.role',
        'member.isOnline',
        'member.joinedAt',
        'user.id',
        'user.username'
      ]);

    // 应用筛选条件
    if (name) {
      queryBuilder = queryBuilder.andWhere('room.name LIKE :name', { name: `%${name}%` });
    }
    
    if (roomCode) {
      queryBuilder = queryBuilder.andWhere('room.roomCode LIKE :roomCode', { roomCode: `%${roomCode}%` });
    }
    
    if (status) {
      queryBuilder = queryBuilder.andWhere('room.status = :status', { status });
    }
    
    if (createdAtStart && createdAtEnd) {
      queryBuilder = queryBuilder.andWhere('room.createdAt BETWEEN :start AND :end', {
        start: new Date(createdAtStart),
        end: new Date(createdAtEnd)
      });
    } else if (createdAtStart) {
      queryBuilder = queryBuilder.andWhere('room.createdAt >= :start', { start: new Date(createdAtStart) });
    } else if (createdAtEnd) {
      queryBuilder = queryBuilder.andWhere('room.createdAt <= :end', { end: new Date(createdAtEnd) });
    }

    // 创建人筛选条件
    if (creatorUsername) {
      queryBuilder = queryBuilder.andWhere(
        'room.id IN (SELECT rm.roomId FROM room_members rm JOIN users u ON rm.userId = u.id WHERE rm.role = :adminRole AND u.username LIKE :creatorUsername)',
        { 
          adminRole: RoomMemberRole.ADMIN,
          creatorUsername: `%${creatorUsername}%`
        }
      );
    }

    // 排序和分页
    queryBuilder = queryBuilder
      .orderBy(`room.${sortBy}`, sortOrder)
      .skip(skip)
      .take(limit);

    const [rooms, total] = await queryBuilder.getManyAndCount();

    // 添加基于Socket的在线数量和更新成员在线状态
    let roomsWithOnlineCount = rooms;
    if (this.collaborationGateway) {
      const onlineCounts = this.collaborationGateway.getAllRoomsOnlineCount();
      roomsWithOnlineCount = rooms.map(room => {
        const actualOnlineUserIds = this.collaborationGateway.getOnlineUserIdsInRoom(room.id);
        const updatedMembers = room.members.map(member => ({
          ...member,
          isOnline: actualOnlineUserIds.includes(member.user.id),
        }));

        return {
          ...room,
          members: updatedMembers,
          onlineCount: onlineCounts.get(room.id) || 0,
        };
      });
    }

    // 添加创建人信息
    const roomsWithCreatorInfo = this.addCreatorInfoToRooms(roomsWithOnlineCount);

    return {
      rooms: roomsWithCreatorInfo,
      total,
    };
  }

  async findOne(id: string): Promise<Room> {
    const room = await this.roomsRepository.findOne({
      where: { id },
      relations: ['members', 'members.user'],
      select: {
        members: {
          id: true,
          role: true,
          isOnline: true,
          joinedAt: true,
          user: {
            id: true,
            username: true,
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // 添加基于Socket的在线数量和更新成员在线状态
    if (this.collaborationGateway) {
      const onlineCount = this.collaborationGateway.getRoomOnlineCount(room.id);
      const actualOnlineUserIds = this.collaborationGateway.getOnlineUserIdsInRoom(room.id);
      
      // 更新成员的在线状态以反映实际的socket连接状态
      const updatedMembers = room.members.map(member => ({
        ...member,
        isOnline: actualOnlineUserIds.includes(member.user.id),
      }));

      return {
        ...room,
        members: updatedMembers,
        onlineCount,
      };
    }

    return room;
  }

  async findByRoomCode(roomCode: string): Promise<Room> {
    const room = await this.roomsRepository.findOne({
      where: { roomCode },
      relations: ['members', 'members.user'],
      select: {
        members: {
          id: true,
          role: true,
          isOnline: true,
          joinedAt: true,
          user: {
            id: true,
            username: true,
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // 添加基于Socket的在线数量和更新成员在线状态
    if (this.collaborationGateway) {
      const onlineCount = this.collaborationGateway.getRoomOnlineCount(room.id);
      const actualOnlineUserIds = this.collaborationGateway.getOnlineUserIdsInRoom(room.id);
      
      // 更新成员的在线状态以反映实际的socket连接状态
      const updatedMembers = room.members.map(member => ({
        ...member,
        isOnline: actualOnlineUserIds.includes(member.user.id),
      }));

      return {
        ...room,
        members: updatedMembers,
        onlineCount,
      };
    }

    return room;
  }

  async findUserRooms(userId: string): Promise<Room[]> {
    // 返回用户参与的所有活跃房间（包括创建的和加入的）
    const roomMembers = await this.roomMembersRepository.find({
      where: {
        userId,
        room: {
          status: RoomStatus.NORMAL // 只返回正常状态的房间
        }
      },
      relations: ['room', 'room.members', 'room.members.user'],
      select: {
        room: {
          id: true,
          name: true,
          description: true,
          roomCode: true,
          password: true,
          status: true,
          language: true,
          createdAt: true,
          updatedAt: true,
          members: {
            id: true,
            role: true,
            isOnline: true,
            lastActiveAt: true,
            joinedAt: true,
            user: {
              id: true,
              username: true,
            },
          },
        },
      },
    });

    const rooms = roomMembers.map(member => member.room);
    
    // 添加基于Socket的在线数量和更新成员在线状态
    if (this.collaborationGateway) {
      const onlineCounts = this.collaborationGateway.getAllRoomsOnlineCount();
      return rooms.map(room => {
        const actualOnlineUserIds = this.collaborationGateway.getOnlineUserIdsInRoom(room.id);
        const updatedMembers = room.members.map(member => ({
          ...member,
          isOnline: actualOnlineUserIds.includes(member.user.id),
        }));

        return {
          ...room,
          members: updatedMembers,
          onlineCount: onlineCounts.get(room.id) || 0,
        };
      });
    }

    return rooms;
  }

  async findUserCreatedRooms(userId: string): Promise<Room[]> {
    // 返回用户创建的房间（admin角色的房间），包括所有状态的房间
    const roomMembers = await this.roomMembersRepository.find({
      where: {
        userId,
        role: RoomMemberRole.ADMIN, // 只返回用户是admin的房间
        // 移除状态筛选，返回所有状态的房间
      },
      relations: ['room', 'room.members', 'room.members.user'],
      select: {
        room: {
          id: true,
          name: true,
          description: true,
          roomCode: true,
          password: true,
          status: true,
          language: true,
          createdAt: true,
          updatedAt: true,
          members: {
            id: true,
            role: true,
            isOnline: true,
            lastActiveAt: true,
            joinedAt: true,
            user: {
              id: true,
              username: true,
            },
          },
        },
      },
      order: {
        joinedAt: 'DESC' // 按创建时间倒序
      }
    });

    const rooms = roomMembers.map(member => member.room);
    
    // 添加基于Socket的在线数量和更新成员在线状态
    let processedRooms = rooms;
    if (this.collaborationGateway) {
      const onlineCounts = this.collaborationGateway.getAllRoomsOnlineCount();
      processedRooms = rooms.map(room => {
        const actualOnlineUserIds = this.collaborationGateway.getOnlineUserIdsInRoom(room.id);
        const updatedMembers = room.members.map(member => ({
          ...member,
          isOnline: actualOnlineUserIds.includes(member.user.id),
        }));

        return {
          ...room,
          members: updatedMembers,
          onlineCount: onlineCounts.get(room.id) || 0,
        };
      });
    }

    // 排序：正常状态的房间在前，已结束的房间在后，同状态内按创建时间倒序
    return processedRooms.sort((a, b) => {
      // 首先按状态排序：normal在前，ended在后
      if (a.status !== b.status) {
        if (a.status === RoomStatus.NORMAL) return -1;
        if (b.status === RoomStatus.NORMAL) return 1;
      }
      
      // 同状态内按创建时间倒序（新的在前）
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  async findUserHistory(userId: string): Promise<Room[]> {
    // 返回用户参与过的已结束房间
    const roomMembers = await this.roomMembersRepository.find({
      where: {
        userId,
        room: {
          status: RoomStatus.ENDED // 只返回已结束的房间
        }
      },
      relations: ['room', 'room.members', 'room.members.user'],
      select: {
        room: {
          id: true,
          name: true,
          description: true,
          roomCode: true,
          password: true,
          status: true,
          language: true,
          createdAt: true,
          updatedAt: true,
          members: {
            id: true,
            role: true,
            isOnline: true,
            lastActiveAt: true,
            joinedAt: true,
            user: {
              id: true,
              username: true,
            },
          },
        },
      },
      order: {
        joinedAt: 'DESC' // 按加入时间倒序
      }
    });

    const rooms = roomMembers.map(member => member.room);
    
    // 添加基于Socket的在线数量和更新成员在线状态（历史房间通常在线数为0，但保持一致性）
    if (this.collaborationGateway) {
      const onlineCounts = this.collaborationGateway.getAllRoomsOnlineCount();
      return rooms.map(room => {
        const actualOnlineUserIds = this.collaborationGateway.getOnlineUserIdsInRoom(room.id);
        const updatedMembers = room.members.map(member => ({
          ...member,
          isOnline: actualOnlineUserIds.includes(member.user.id),
        }));

        return {
          ...room,
          members: updatedMembers,
          onlineCount: onlineCounts.get(room.id) || 0,
        };
      });
    }

    return rooms;
  }

  async update(id: string, updateRoomDto: UpdateRoomDto, userId: string, userRole: UserRole): Promise<Room> {
    const room = await this.findOne(id);

    // Check if user has permission to update room
    const member = room.members.find(m => m.user.id === userId);
    if (!member && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('You are not a member of this room');
    }

    // 移除admin权限限制，允许所有房间成员保存内容
    // 只要是房间成员就可以更新内容
    console.log(`用户 ${userId} 正在更新房间 ${id}，成员角色: ${member?.role}`);

    // 如果更新包含内容，检查内容大小
    if (updateRoomDto.content !== undefined) {
      const maxContentSize = 50 * 1024 * 1024; // 50MB
      if (updateRoomDto.content.length > maxContentSize) {
        throw new BadRequestException(`内容过大，最大支持 ${Math.floor(maxContentSize / 1024 / 1024)}MB`);
      }
    }

    Object.assign(room, updateRoomDto);
    await this.roomsRepository.save(room);

    return this.findOne(id);
  }

  async remove(id: string, userId: string, userRole: UserRole): Promise<{ onlineMembers: any[] }> {
    const room = await this.findOne(id);

    // Check if user has permission to delete room
    const member = room.members.find(m => m.user.id === userId);
    if (!member && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('You are not a member of this room');
    }

    if (member && member.role !== RoomMemberRole.ADMIN && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only room admins can delete rooms');
    }

    // 获取在线用户列表（除了删除者）
    const onlineMembers = room.members.filter(m => m.isOnline && m.user.id !== userId);

    console.log('🏠 Room deletion process:', {
      roomId: id,
      roomName: room.name,
      onlineMembersCount: onlineMembers.length,
      onlineMembers: onlineMembers.map(m => ({ id: m.user.id, username: m.user.username })),
      deletedBy: userId,
      hasCollaborationGateway: !!this.collaborationGateway
    });

    // 如果有在线用户，通过WebSocket通知他们房间即将被删除
    if (onlineMembers.length > 0 && this.collaborationGateway) {
      console.log('🚨 Notifying online users about room deletion...');
      // 通知所有在线用户房间被强制删除
      onlineMembers.forEach(member => {
        console.log(`🚨 Notifying user ${member.user.username} (${member.user.id}) about room deletion`);
        this.collaborationGateway.notifyRoomForceDeleted(id, member.user.id, {
          message: `房间 "${room.name}" 已被管理员删除`,
          deletedBy: userId,
          roomName: room.name
        });
      });

      // 强制所有用户离线
      await this.roomMembersRepository.update(
        { roomId: id },
        { isOnline: false }
      );
    }

    // 强制删除房间，不管是否有其他成员
    await this.roomsRepository.remove(room);

    return { onlineMembers: onlineMembers.map(m => ({ id: m.user.id, username: m.user.username })) };
  }

  async joinRoom(joinRoomDto: JoinRoomDto, userId: string): Promise<RoomMember> {
    const { roomId, role = RoomMemberRole.MEMBER } = joinRoomDto;

    const room = await this.findOne(roomId);

    // Check if user is already a member
    const existingMember = await this.roomMembersRepository.findOne({
      where: { userId, roomId },
      relations: ['user']
    });

    if (existingMember) {
      // If user is already a member, return existing membership
      // Note: isOnline status is managed by Socket connections only
      console.log('🏠 User is already a member:', {
        id: existingMember.id,
        isOnline: existingMember.isOnline,
        username: existingMember.user?.username
      });
      return existingMember;
    }

    // Create new member (isOnline will be set when Socket connects)
    const roomMember = this.roomMembersRepository.create({
      userId,
      roomId,
      role,
      // isOnline defaults to false, will be set to true when Socket connects
    });

    const savedMember = await this.roomMembersRepository.save(roomMember);
    console.log('🏠 Created new member:', {
      id: savedMember.id,
      isOnline: savedMember.isOnline,
      userId: savedMember.userId
    });

    return savedMember;
  }

  async joinRoomByCode(joinRoomByCodeDto: JoinRoomByCodeDto, userId: string): Promise<RoomMember> {
    const { roomCode, password, role = RoomMemberRole.MEMBER } = joinRoomByCodeDto;

    const room = await this.findByRoomCode(roomCode);

    // 检查房间状态
    if (room.status === RoomStatus.ENDED) {
      throw new BadRequestException('This room has ended and cannot be joined');
    }

    // 检查密码
    if (room.password) {
      if (!password) {
        throw new BadRequestException('This room requires a password');
      }

      const isPasswordValid = await bcrypt.compare(password, room.password);
      if (!isPasswordValid) {
        throw new BadRequestException('Invalid password');
      }
    }

    // Check if user is already a member
    const existingMember = await this.roomMembersRepository.findOne({
      where: { userId, roomId: room.id },
      relations: ['user']
    });

    if (existingMember) {
      // If user is already a member, return existing membership
      // Note: isOnline status is managed by Socket connections only
      console.log('🏠 User is already a member (by code):', {
        id: existingMember.id,
        isOnline: existingMember.isOnline,
        username: existingMember.user?.username
      });
      return existingMember;
    }

    // Create new member (isOnline will be set when Socket connects)
    const roomMember = this.roomMembersRepository.create({
      userId,
      roomId: room.id,
      role,
      // isOnline defaults to false, will be set to true when Socket connects
    });

    const savedMember = await this.roomMembersRepository.save(roomMember);
    console.log('🏠 Created new member (by code):', {
      id: savedMember.id,
      isOnline: savedMember.isOnline,
      userId: savedMember.userId
    });

    return savedMember;
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const roomMember = await this.roomMembersRepository.findOne({
      where: { userId, roomId },
    });

    if (!roomMember) {
      throw new NotFoundException('You are not a member of this room');
    }

    // Check if the user is the room creator (admin)
    if (roomMember.role === RoomMemberRole.ADMIN) {
      throw new ForbiddenException('Room creators cannot leave their own room. Please delete the room instead.');
    }

    await this.roomMembersRepository.remove(roomMember);
  }

  async updateMemberStatus(roomId: string, userId: string, isOnline: boolean): Promise<boolean> {
    this.logger.logDebug(
      `Socket-based status update: userId=${userId}, roomId=${roomId}, isOnline=${isOnline}`,
      { userId, roomId, isOnline },
      'RoomsService'
    );

    try {
      // Use a more robust approach with direct database update to avoid race conditions
      const updateResult = await this.roomMembersRepository.update(
        { userId, roomId },
        {
          isOnline,
          lastActiveAt: new Date()
        }
      );

      if (updateResult.affected === 0) {
        this.logger.logWarning(
          `Member not found for status update: userId=${userId}, roomId=${roomId}`,
          { userId, roomId, isOnline },
          'RoomsService'
        );
        // Return false to indicate the update failed, but don't crash the service
        return false;
      }

      // Get the updated member for logging
      const member = await this.roomMembersRepository.findOne({
        where: { userId, roomId },
        relations: ['user']
      });

      if (member) {
        this.logger.logInfo(
          `Socket status updated: ${member.user?.username} → ${isOnline ? 'online' : 'offline'}`,
          {
            userId,
            roomId,
            username: member.user?.username,
            newStatus: isOnline
          },
          'RoomsService'
        );
      }

      return true;
    } catch (error) {
      this.logger.logError(
        `Failed to update member status: userId=${userId}, roomId=${roomId}`,
        error instanceof Error ? error : new Error(String(error)),
        { userId, roomId, isOnline },
        'RoomsService'
      );
      // Return false to indicate failure, but don't crash the service
      return false;
    }
  }

  /**
   * Safely update member status with additional checks for data consistency
   */
  async safeUpdateMemberStatus(roomId: string, userId: string, isOnline: boolean): Promise<boolean> {
    this.logger.logDebug(
      `Safe member status update: userId=${userId}, roomId=${roomId}, isOnline=${isOnline}`,
      { userId, roomId, isOnline },
      'RoomsService'
    );

    try {
      // First check if the room and member still exist
      const room = await this.roomsRepository.findOne({
        where: { id: roomId },
        relations: ['members', 'members.user']
      });

      if (!room) {
        this.logger.logWarning(
          `Room not found for member status update: roomId=${roomId}`,
          { userId, roomId, isOnline },
          'RoomsService'
        );
        return false;
      }

      const member = room.members.find(m => m.user.id === userId);
      if (!member) {
        this.logger.logWarning(
          `Member not found in room for status update: userId=${userId}, roomId=${roomId}`,
          { userId, roomId, isOnline, roomMemberCount: room.members.length },
          'RoomsService'
        );
        return false;
      }

      // Update the member status
      return await this.updateMemberStatus(roomId, userId, isOnline);
    } catch (error) {
      this.logger.logError(
        `Failed to safely update member status: userId=${userId}, roomId=${roomId}`,
        error instanceof Error ? error : new Error(String(error)),
        { userId, roomId, isOnline },
        'RoomsService'
      );
      return false;
    }
  }

  async updateRoomContent(roomId: string, content: string): Promise<void> {
    // 检查内容大小限制（LONGTEXT最大4GB，但实际建议限制在合理范围内）
    const maxContentSize = 50 * 1024 * 1024; // 50MB
    if (content.length > maxContentSize) {
      throw new BadRequestException(`内容过大，最大支持 ${Math.floor(maxContentSize / 1024 / 1024)}MB`);
    }
    
    await this.roomsRepository.update(roomId, { content });
  }

  async endRoom(roomId: string, userId: string, userRole: UserRole): Promise<Room> {
    const room = await this.findOne(roomId);

    // 检查权限：只有房间创建者或系统管理员可以结束房间
    const member = room.members.find(m => m.user.id === userId);
    if (!member && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('You are not a member of this room');
    }

    if (member && member.role !== RoomMemberRole.ADMIN && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only room creators can end rooms');
    }

    // 检查房间状态
    if (room.status === RoomStatus.ENDED) {
      throw new BadRequestException('Room is already ended');
    }

    // 更新房间状态为已结束
    await this.roomsRepository.update(roomId, {
      status: RoomStatus.ENDED,
      updatedAt: new Date()
    });

    // 将所有成员设置为离线
    await this.roomMembersRepository.update(
      { roomId },
      { isOnline: false }
    );

    // 通知所有房间成员房间已结束
    if (this.collaborationGateway) {
      this.collaborationGateway.notifyRoomEnded(roomId, userId);
    }

    return this.findOne(roomId);
  }
}
