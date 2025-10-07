import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoomsService } from '../rooms/rooms.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomMember } from '../rooms/entities/room-member.entity';
import { CustomLoggerService } from '../common/logger/logger.service';
import * as Y from 'yjs';

interface AuthenticatedSocket extends Socket {
  user?: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
}

@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:3001', // Admin panel
      'http://localhost:5173', // Electron renderer
      'http://localhost:3000', // Backend itself
      'http://localhost:8080', // Web client
      'http://127.0.0.1:3001', // Admin panel (alternative)
      'http://127.0.0.1:5173', // Electron renderer (alternative)
      'http://127.0.0.1:8080', // Web client (alternative)
      'null', // For file:// protocol (local HTML files)
    ],
    credentials: true,
  },
})
export class CollaborationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private roomDocuments = new Map<string, Y.Doc>();
  private userRooms = new Map<string, string>(); // userId -> roomId
  private roomSockets = new Map<string, Set<string>>(); // roomId -> Set<socketId>
  private socketUsers = new Map<string, { userId: string; roomId: string }>(); // socketId -> user info

  constructor(
    private roomsService: RoomsService,
    @InjectRepository(RoomMember)
    private roomMembersRepository: Repository<RoomMember>,
    private readonly logger: CustomLoggerService,
  ) {
    // 设置双向引用以避免循环依赖
    this.roomsService.setCollaborationGateway(this);
  }

  // 更新用户活跃状态
  private async updateUserActivity(userId: string, roomId: string) {
    try {
      await this.roomMembersRepository.update(
        { userId, roomId },
        { 
          lastActiveAt: new Date(),
          isOnline: true  // 确保用户在线状态为true
        }
      );
    } catch (error) {
      console.error('Error updating user activity:', error);
    }
  }

  // 通知用户房间被强制删除
  notifyRoomForceDeleted(roomId: string, userId: string, data: any) {
    try {
      console.log(`🚨 Looking for user ${userId} sockets to notify about room ${roomId} deletion`);
      
      // 查找用户的socket连接 - 使用socketUsers映射
      const userSocketIds: string[] = [];
      for (const [socketId, socketInfo] of this.socketUsers.entries()) {
        if (socketInfo.userId === userId) {
          userSocketIds.push(socketId);
        }
      }

      console.log(`🚨 Found ${userSocketIds.length} sockets for user ${userId}:`, userSocketIds);

      if (userSocketIds.length === 0) {
        console.log(`🚨 No active sockets found for user ${userId}`);
        return;
      }

      userSocketIds.forEach(socketId => {
        const socket = this.server.sockets.sockets.get(socketId);
        if (socket) {
          console.log(`🚨 Sending room-force-deleted event to socket ${socketId}`);
          socket.emit('room-force-deleted', {
            roomId,
            ...data
          });

          // 强制用户离开房间
          socket.leave(roomId);
        }
      });

      console.log(`🚨 Successfully notified user ${userId} about room ${roomId} force deletion`);
    } catch (error) {
      console.error('Error notifying room force deletion:', error);
    }
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      this.logger.logDebug(`Socket connected: ${client.id}`, { socketId: client.id }, 'CollaborationGateway');
      // Note: We don't increment online count here yet, only when user joins a specific room
    } catch (error) {
      this.logger.logError('WebSocket connection error', error instanceof Error ? error : new Error(String(error)), { socketId: client.id }, 'CollaborationGateway');
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    this.logger.logDebug(`Socket disconnected: ${client.id}`, { socketId: client.id }, 'CollaborationGateway');

    // Get socket user info from our mapping
    const socketUserInfo = this.socketUsers.get(client.id);
    if (socketUserInfo) {
      const { userId, roomId } = socketUserInfo;

      this.logger.logInfo(
        `User Socket disconnecting: ${client.user?.username || 'Unknown'} (${userId})`,
        { userId, socketId: client.id, roomId },
        'CollaborationGateway'
      );

      try {
        // Remove this socket from room's socket set
        const roomSockets = this.roomSockets.get(roomId);
        if (roomSockets) {
          roomSockets.delete(client.id);

          // Calculate new online count based on active sockets in room
          const newOnlineCount = roomSockets.size;

          this.logger.logInfo(
            `Socket disconnection: Room ${roomId} now has ${newOnlineCount} online sockets`,
            { roomId, onlineSocketCount: newOnlineCount, disconnectedSocketId: client.id },
            'CollaborationGateway'
          );

          // Clean up empty socket set
          if (roomSockets.size === 0) {
            this.roomSockets.delete(roomId);
          }

          // Get room info for user details
          const room = await this.roomsService.findOne(roomId);
          const onlineUsers = this.getOnlineUsersInRoom(roomId, room);

          // Notify other users in the room about user leaving
          this.server.to(roomId).emit('user-left', {
            userId,
            username: client.user?.username || 'Unknown',
          });

          // Send updated online users list to room members
          this.server.to(roomId).emit('online-users-updated', {
            roomId,
            onlineUsers,
          });

          // 通知房间列表更新（广播给所有用户）- 基于Socket连接数
          this.server.emit('room-updated', {
            roomId,
            onlineCount: newOnlineCount,
          });

          this.logger.logInfo(
            `User socket disconnected, room online count updated`,
            { userId, roomId, newOnlineCount },
            'CollaborationGateway'
          );
        }

        // Clean up mappings
        client.leave(roomId);
        this.socketUsers.delete(client.id);
        this.userRooms.delete(userId);

      } catch (error) {
        this.logger.logError(
          'Error handling socket disconnect',
          error instanceof Error ? error : new Error(String(error)),
          { userId, roomId, socketId: client.id },
          'CollaborationGateway'
        );
        // Clean up resources even if there was an error
        this.socketUsers.delete(client.id);
        if (socketUserInfo.roomId) {
          client.leave(socketUserInfo.roomId);
          this.userRooms.delete(userId);
        }
      }
    } else {
      this.logger.logDebug('Socket disconnected without user mapping', { socketId: client.id }, 'CollaborationGateway');
    }
  }

  /**
   * Get online users in a room based on active socket connections
   */
  private getOnlineUsersInRoom(roomId: string, room: any): any[] {
    const roomSockets = this.roomSockets.get(roomId);
    if (!roomSockets || roomSockets.size === 0) {
      return [];
    }

    const onlineUserIds = new Set<string>();
    // Get unique user IDs from active sockets
    for (const socketId of roomSockets) {
      const socketUserInfo = this.socketUsers.get(socketId);
      if (socketUserInfo) {
        onlineUserIds.add(socketUserInfo.userId);
      }
    }

    // Map user IDs to user details from room members
    const onlineUsers = [];
    for (const userId of onlineUserIds) {
      const member = room.members.find((m: any) => m.user.id === userId);
      if (member) {
        onlineUsers.push({
          id: member.user.id,
          username: member.user.username,
          role: member.role,
        });
      }
    }

    return onlineUsers;
  }

  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string; user: any },
  ) {
    try {
      console.log('🏠 Join room request:', { roomId: data.roomId, user: data.user });
      const { roomId, user } = data;
      client.user = user;

      // Verify user has access to room
      const room = await this.roomsService.findOne(roomId);
      console.log('🏠 Room found:', { roomId, memberCount: room.members.length });

      const memberRecord = room.members.find(member => member.user.id === user.id);
      const isMember = !!memberRecord;
      console.log('🏠 User membership check:', {
        userId: user.id,
        isMember,
        memberRecord: memberRecord ? {
          id: memberRecord.id,
          userId: memberRecord.userId,
          isOnline: memberRecord.isOnline,
          role: memberRecord.role
        } : null
      });

      if (!isMember) {
        console.log('❌ Access denied to room for user:', user.id);
        client.emit('error', { message: 'Access denied to room' });
        return;
      }

      // Join room
      client.join(roomId);
      
      // 🔧 FIX: 清理同一用户的旧连接，防止重复连接导致状态错误
      const existingRoomId = this.userRooms.get(user.id);
      if (existingRoomId) {
        console.log('🔧 Found existing connection for user, cleaning up old connections');
        // 查找并清理该用户的旧Socket连接
        const socketsToRemove: string[] = [];
        this.socketUsers.forEach((socketInfo, socketId) => {
          if (socketInfo.userId === user.id && socketId !== client.id) {
            socketsToRemove.push(socketId);
          }
        });
        
        // 清理旧的Socket映射
        socketsToRemove.forEach(oldSocketId => {
          console.log(`🔧 Cleaning up old socket ${oldSocketId} for user ${user.username}`);
          this.socketUsers.delete(oldSocketId);
          // 从房间Socket集合中移除旧连接
          const oldRoomSockets = this.roomSockets.get(existingRoomId);
          if (oldRoomSockets) {
            oldRoomSockets.delete(oldSocketId);
          }
        });
      }
      
      this.userRooms.set(user.id, roomId);

      // 🔑 Track socket connections for online count
      if (!this.roomSockets.has(roomId)) {
        this.roomSockets.set(roomId, new Set());
      }
      this.roomSockets.get(roomId)!.add(client.id);
      this.socketUsers.set(client.id, { userId: user.id, roomId });

      console.log('🔑 Socket user mapping updated:', {
        socketId: client.id,
        userId: user.id,
        username: user.username,
        roomId,
        totalSocketUsers: this.socketUsers.size
      });
      console.log('🔑 Current socketUsers mapping:', Array.from(this.socketUsers.entries()));

      // 立即更新用户在线状态
      await this.updateUserActivity(user.id, roomId);
      console.log('🔑 Updated user online status for:', user.username);

      const newOnlineCount = this.roomSockets.get(roomId)!.size;
      this.logger.logInfo(
        `Socket joined room: ${user.username} (${user.id}) - Room now has ${newOnlineCount} online sockets`,
        { userId: user.id, roomId, socketId: client.id, onlineSocketCount: newOnlineCount },
        'CollaborationGateway'
      );

      // Initialize Y.Doc for room if not exists
      if (!this.roomDocuments.has(roomId)) {
        const doc = new Y.Doc();
        this.roomDocuments.set(roomId, doc);

        // Load existing content if any
        if (room.content) {
          const yText = doc.getText('content');
          yText.insert(0, room.content);
        }
      }

      const doc = this.roomDocuments.get(roomId);
      const currentContent = doc.getText('content').toString();

      // Get online users based on active socket connections
      const onlineUsers = this.getOnlineUsersInRoom(roomId, room);
      console.log('🏠 Online users (socket-based):', onlineUsers);

      const roomJoinedData = {
        roomId,
        content: currentContent,
        language: room.language,
        members: onlineUsers,
      };

      console.log('🏠 Sending room-joined event:', roomJoinedData);
      console.log('🏠 Members count:', roomJoinedData.members.length);
      console.log('🏠 Members details:', JSON.stringify(roomJoinedData.members, null, 2));
      console.log('🏠 Client socket ID:', client.id);
      console.log('🏠 Emitting to client...');
      client.emit('room-joined', roomJoinedData);
      console.log('🏠 room-joined event emitted successfully');

      // Notify other users in the room
      client.to(roomId).emit('user-joined', {
        userId: user.id,
        username: user.username,
      });

      // Send updated online users list to room members (包括刚加入的用户)
      this.server.to(roomId).emit('online-users-updated', {
        roomId,
        onlineUsers,
      });

      // 🔧 为了确保重连用户能收到最新状态，也单独发送给当前用户
      client.emit('online-users-updated', {
        roomId,
        onlineUsers,
      });

      // 通知房间列表更新（广播给所有用户）- 基于Socket连接数
      this.server.emit('room-updated', {
        roomId,
        onlineCount: newOnlineCount,
      });

    } catch (error) {
      console.error('Error joining room:', error);
      client.emit('error', { message: 'Failed to join room' });
    }
  }

  @SubscribeMessage('leave-room')
  async handleLeaveRoom(@ConnectedSocket() client: AuthenticatedSocket) {
    const socketUserInfo = this.socketUsers.get(client.id);
    if (socketUserInfo) {
      const { userId, roomId } = socketUserInfo;

      this.logger.logInfo(
        `User actively leaving room: ${client.user?.username || 'Unknown'} (${userId})`,
        { userId, roomId, socketId: client.id },
        'CollaborationGateway'
      );

      try {
        // Remove this socket from room's socket set
        const roomSockets = this.roomSockets.get(roomId);
        if (roomSockets) {
          roomSockets.delete(client.id);

          // Calculate new online count based on active sockets in room
          const newOnlineCount = roomSockets.size;

          this.logger.logInfo(
            `Active leave: Room ${roomId} now has ${newOnlineCount} online sockets`,
            { roomId, onlineSocketCount: newOnlineCount, leftSocketId: client.id },
            'CollaborationGateway'
          );

          // Clean up empty socket set
          if (roomSockets.size === 0) {
            this.roomSockets.delete(roomId);
          }

          // Get room info for user details
          const room = await this.roomsService.findOne(roomId);
          const onlineUsers = this.getOnlineUsersInRoom(roomId, room);

          // Notify other users in the room about user leaving
          this.server.to(roomId).emit('user-left', {
            userId,
            username: client.user?.username || 'Unknown',
          });

          // Send updated online users list to room members
          this.server.to(roomId).emit('online-users-updated', {
            roomId,
            onlineUsers,
          });

          // 通知房间列表更新（广播给所有用户）- 基于Socket连接数
          this.server.emit('room-updated', {
            roomId,
            onlineCount: newOnlineCount,
          });
        }

        // Clean up mappings
        client.leave(roomId);
        this.socketUsers.delete(client.id);
        this.userRooms.delete(userId);

      } catch (error) {
        this.logger.logError(
          'Error handling active room leave',
          error instanceof Error ? error : new Error(String(error)),
          { userId, roomId, socketId: client.id },
          'CollaborationGateway'
        );
        // Clean up resources even if there was an error
        this.socketUsers.delete(client.id);
        client.leave(roomId);
        this.userRooms.delete(userId);
      }
    }
  }

  @SubscribeMessage('content-change')
  async handleContentChange(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string; delta: any; content: string },
  ) {
    try {
      const { roomId, delta, content } = data;

      if (!client.user) {
        client.emit('error', { message: 'User not authenticated' });
        return;
      }

      // 检查内容大小限制
      const maxContentSize = 50 * 1024 * 1024; // 50MB
      if (content.length > maxContentSize) {
        client.emit('error', { 
          message: `内容过大，最大支持 ${Math.floor(maxContentSize / 1024 / 1024)}MB`,
          code: 'CONTENT_TOO_LARGE' 
        });
        return;
      }

      // 更新用户活跃状态
      await this.updateUserActivity(client.user.id, roomId);

      // 避免重复的Y.js和Socket.IO同步 - 仅保存到数据库，不操作Y.Doc
      // Y.js通过WebSocket Provider自行处理文档同步
      // 这里只处理数据库保存和用户通知

      // Save to database periodically or on specific events
      try {
        await this.roomsService.updateRoomContent(roomId, content);
      } catch (saveError: any) {
        console.error('Error saving content to database:', saveError);
        client.emit('error', { 
          message: saveError.message || '保存内容失败',
          code: 'SAVE_FAILED' 
        });
        return;
      }

      // 不再广播内容变化，避免与Y.js WebSocket Provider的同步冲突
      // Y.js WebSocket Provider会自动处理实时协作同步
      console.log(`Content saved to database for room ${roomId} by user ${client.user.username}`);

    } catch (error) {
      console.error('Error handling content change:', error);
      client.emit('error', { 
        message: 'Failed to update content',
        code: 'UPDATE_FAILED' 
      });
    }
  }

  @SubscribeMessage('cursor-position')
  async handleCursorPosition(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string; position: any },
  ) {
    if (client.user) {
      const { roomId, position } = data;

      console.log('🎯 ===== CURSOR POSITION RECEIVED =====');
      console.log('🎯 From user:', { id: client.user.id, username: client.user.username });
      console.log('🎯 Room ID:', roomId);
      console.log('🎯 Position:', position);
      console.log('🎯 Socket ID:', client.id);

      // 更新用户活跃状态
      await this.updateUserActivity(client.user.id, roomId);

      // Broadcast cursor position to other users in the room
      const broadcastData = {
        userId: client.user.id,
        username: client.user.username,
        position,
      };

      console.log('🎯 Broadcasting to room:', roomId);
      console.log('🎯 Broadcast data:', broadcastData);
      console.log('🎯 Sender socket ID:', client.id);
      console.log('🎯 Sender user ID:', client.user.id);

      // 获取房间中的所有Socket连接进行调试
      const roomSockets = this.server.sockets.adapter.rooms.get(roomId);
      console.log('🎯 Room sockets:', roomSockets ? Array.from(roomSockets) : 'No sockets');
      console.log('🎯 Sender socket in room:', roomSockets ? roomSockets.has(client.id) : false);

      // 使用更安全的广播方式：明确排除发送者
      if (roomSockets) {
        let broadcastCount = 0;
        roomSockets.forEach(socketId => {
          if (socketId !== client.id) {
            const targetSocket = this.server.sockets.sockets.get(socketId);
            if (targetSocket) {
              console.log('🎯 Sending to socket:', socketId);
              targetSocket.emit('cursor-moved', broadcastData);
              broadcastCount++;
            }
          }
        });
        console.log('🎯 Broadcast sent to', broadcastCount, 'sockets (excluding sender)');
      }

      console.log('🎯 ===== CURSOR BROADCAST SENT =====');
    }
  }

  @SubscribeMessage('user-typing')
  async handleUserTyping(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const { roomId } = data;
    console.log('⌨️ User typing event received:', {
      userId: client.user.id,
      username: client.user.username,
      roomId
    });

    // 广播打字状态给房间中的其他用户
    const broadcastData = {
      userId: client.user.id,
      username: client.user.username,
    };

    console.log('⌨️ Broadcasting typing status to room:', roomId);

    // 获取房间中的所有Socket连接进行调试
    const roomSockets = this.server.sockets.adapter.rooms.get(roomId);
    console.log('⌨️ Room sockets:', roomSockets ? Array.from(roomSockets) : 'No sockets');
    console.log('⌨️ Sender socket in room:', roomSockets ? roomSockets.has(client.id) : false);

    // 使用更安全的广播方式：明确排除发送者，只发送给其他用户
    if (roomSockets) {
      let broadcastCount = 0;
      roomSockets.forEach(socketId => {
        if (socketId !== client.id) {
          const targetSocket = this.server.sockets.sockets.get(socketId);
          if (targetSocket) {
            console.log('⌨️ Sending typing status to socket:', socketId);
            targetSocket.emit('user-typing', broadcastData);
            broadcastCount++;
          }
        }
      });
      console.log('⌨️ Typing status broadcast sent to', broadcastCount, 'sockets (excluding sender)');
    }
  }

  @SubscribeMessage('selection-change')
  async handleSelectionChange(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string; selection: any },
  ) {
    if (client.user) {
      const { roomId, selection } = data;

      // 更新用户活跃状态
      await this.updateUserActivity(client.user.id, roomId);

      // Broadcast selection change to other users in the room
      client.to(roomId).emit('selection-change', {
        userId: client.user.id,
        username: client.user.username,
        selection,
      });
    }
  }

  @SubscribeMessage('selection-clear')
  async handleSelectionClear(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    if (client.user) {
      const { roomId } = data;

      // Broadcast selection clear to other users in the room
      client.to(roomId).emit('selection-clear', {
        userId: client.user.id,
      });
    }
  }

  @SubscribeMessage('language-change')
  async handleLanguageChange(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string; language: string },
  ) {
    try {
      const { roomId, language } = data;

      if (!client.user) {
        client.emit('error', { message: 'User not authenticated' });
        return;
      }

      // 验证用户是否是房间成员
      const room = await this.roomsService.findOne(roomId);
      const isMember = room.members.some(member => member.user.id === client.user.id);
      
      if (!isMember) {
        client.emit('error', { message: 'You are not a member of this room' });
        return;
      }

      // Update room language in database - 允许所有房间成员更新语言
      await this.roomsService.update(
        roomId,
        { language },
        client.user.id,
        client.user.role as any,
      );

      // Broadcast language change to all users in the room
      this.server.to(roomId).emit('language-changed', {
        language,
        userId: client.user.id,
        username: client.user.username,
      });

      console.log(`Language changed by ${client.user.username} to ${language} in room ${roomId}`);

    } catch (error) {
      console.error('Error changing language:', error);
      client.emit('error', { message: 'Failed to change language' });
    }
  }

  // 通知房间结束
  notifyRoomEnded(roomId: string, endedBy: string) {
    this.server.to(roomId).emit('room-ended', {
      message: '房间已被创建者结束',
      endedBy,
      timestamp: new Date().toISOString(),
    });
  }

  // 获取房间的socket在线数量
  getRoomOnlineCount(roomId: string): number {
    const roomSockets = this.roomSockets.get(roomId);
    return roomSockets ? roomSockets.size : 0;
  }

  // 获取所有房间的在线数量
  getAllRoomsOnlineCount(): Map<string, number> {
    const result = new Map<string, number>();
    for (const [roomId, sockets] of this.roomSockets.entries()) {
      result.set(roomId, sockets.size);
    }
    return result;
  }

  // 获取房间中在线用户的ID列表（基于实际Socket连接）
  getOnlineUserIdsInRoom(roomId: string): string[] {
    const roomSockets = this.roomSockets.get(roomId);
    if (!roomSockets || roomSockets.size === 0) {
      return [];
    }

    const onlineUserIds = new Set<string>();
    // 获取房间中活跃socket对应的唯一用户ID
    for (const socketId of roomSockets) {
      const socketUserInfo = this.socketUsers.get(socketId);
      if (socketUserInfo) {
        onlineUserIds.add(socketUserInfo.userId);
      }
    }

    return Array.from(onlineUserIds);
  }

  // 🔧 添加状态同步请求处理器，用于重连后主动同步状态
  @SubscribeMessage('sync-room-state')
  async handleSyncRoomState(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    try {
      const { roomId } = data;

      if (!client.user) {
        client.emit('error', { message: 'User not authenticated' });
        return;
      }

      console.log('🔄 Room state sync requested by user:', client.user.username);

      // 获取房间信息
      const room = await this.roomsService.findOne(roomId);
      const onlineUsers = this.getOnlineUsersInRoom(roomId, room);

      // 发送最新的在线用户状态
      client.emit('online-users-updated', {
        roomId,
        onlineUsers,
      });

      // 发送房间更新信息
      client.emit('room-updated', {
        roomId,
        onlineCount: this.getRoomOnlineCount(roomId),
      });

      console.log('🔄 Room state synced for user:', client.user.username);

    } catch (error) {
      console.error('Error syncing room state:', error);
      client.emit('error', { message: 'Failed to sync room state' });
    }
  }
}
