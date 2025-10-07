# 错误处理修复总结

## 问题描述

原始错误：

```
🔄 Member not found for status update: userId=e52b819a-d02a-4de1-a191-ad1dc749f537, roomId=b8bd2ecb-76d6-4718-89d9-d03aacaf3fb7
/www/wwwroot/interview/back/src/rooms/rooms.service.ts:448
throw new Error('Member not found');
^

Error: Member not found
at RoomsService.updateMemberStatus (/www/wwwroot/interview/back/src/rooms/rooms.service.ts:448:13)
at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
at async CollaborationGateway.handleDisconnect (/www/wwwroot/interview/back/src/collaboration/collaboration.gateway.ts:115:9)
```

**根本原因**：WebSocket 断开连接时，如果找不到对应的房间成员记录，会抛出未捕获的异常，导致整个 Node.js 进程崩溃。

## 修复方案

### 1. 添加日志系统 ✅

- 创建了 `CustomLoggerService` 类，提供结构化日志记录
- 支持不同日志级别：error, warn, info, debug, verbose
- 自动写入日志文件到 `logs/` 目录
- 集成到全局模块中

**文件**：

- `src/common/logger/logger.service.ts`
- `src/common/logger/logger.module.ts`

### 2. 添加全局异常过滤器 ✅

- 创建了 `GlobalExceptionFilter` 来捕获所有未处理的异常
- 防止服务崩溃，优雅地处理错误
- 记录详细的错误信息和上下文

**文件**：

- `src/common/filters/global-exception.filter.ts`

### 3. 修复 RoomsService 中的错误处理 ✅

- 重构了 `updateMemberStatus` 方法，使用数据库直接更新避免竞态条件
- 添加了 `safeUpdateMemberStatus` 方法，提供额外的数据一致性检查
- 错误时返回 `false` 而不是抛出异常

**关键改进**：

```typescript
// 之前：会抛出异常导致服务崩溃
if (!member) {
  throw new Error('Member not found');
}

// 现在：安全处理，记录日志但不崩溃
if (!member) {
  this.logger.logWarning('Member not found for status update', {...});
  return false; // 返回失败状态，但不崩溃
}
```

### 4. 修复 CollaborationGateway 中的错误处理 ✅

- 在 `handleDisconnect` 方法中添加了 try-catch 块
- 使用新的 `safeUpdateMemberStatus` 方法
- 即使状态更新失败，也会清理用户映射关系

**关键改进**：

```typescript
try {
  const updateSuccess = await this.roomsService.safeUpdateMemberStatus(
    roomId,
    client.user.id,
    false
  );
  if (!updateSuccess) {
    // 记录警告但继续处理，不崩溃服务
    this.logger.logWarning("Failed to update member status on disconnect");
    client.leave(roomId);
    this.userRooms.delete(client.user.id);
    return;
  }
  // 继续正常处理...
} catch (error) {
  this.logger.logError("Error handling user disconnect", error);
  // 清理资源但不重新抛出异常
}
```

### 5. 集成到应用模块 ✅

- 更新了 `app.module.ts` 来集成日志模块和全局异常过滤器
- 确保所有服务都能使用新的错误处理机制

## 测试结果 ✅

运行了错误处理测试：

- ✅ 服务器健康检查通过
- ✅ 无效请求被优雅处理（返回适当的 HTTP 状态码）
- ✅ 服务器在错误测试后仍然健康运行
- ✅ 没有服务崩溃

## 预防措施

### 竞态条件的根本原因

1. **用户快速连接/断开**：WebSocket 连接和断开事件可能快速发生
2. **数据一致性问题**：用户可能通过 HTTP API 离开房间，但 WebSocket 连接仍然存在
3. **异步操作时序**：数据库更新和 WebSocket 事件处理的时序问题

### 解决方案

1. **使用原子数据库操作**：直接使用 `repository.update()` 而不是先查询再更新
2. **优雅降级**：错误时记录日志但继续服务，而不是崩溃
3. **资源清理**：即使业务逻辑失败，也要清理 WebSocket 相关资源
4. **结构化日志**：详细记录错误上下文，便于调试

## 部署建议

1. **环境变量**：设置 `LOG_LEVEL=info` 用于生产环境
2. **日志轮转**：日志文件会按日期自动轮转
3. **监控**：监控 `logs/error-*.log` 文件中的错误
4. **健康检查**：定期访问 `/health` 端点检查服务状态

## 在线人数逻辑重构 ✅

### 问题背景

原始在线人数逻辑基于数据库中的 `isOnline` 字段，存在以下问题：

- 竞态条件：Socket 连接/断开与数据库更新时序不一致
- 不准确：不能反映真实的 Socket 连接状态
- 复杂性：需要维护数据库状态与 Socket 状态的同步

### 新的实现方案

**核心原则**：在线人数 = Socket 连接数

#### 1. 数据结构

```typescript
private roomSockets = new Map<string, Set<string>>(); // roomId -> Set<socketId>
private socketUsers = new Map<string, { userId: string; roomId: string }>(); // socketId -> user info
```

#### 2. 关键流程

- **Socket 连接**：`handleConnection` - 仅记录连接，不计数
- **加入房间**：`join-room` - 添加到 roomSockets，计数+1，广播更新
- **离开房间**：`leave-room` - 从 roomSockets 移除，计数-1，广播更新
- **Socket 断开**：`handleDisconnect` - 从 roomSockets 移除，计数-1，广播更新

#### 3. 核心方法

- `getOnlineUsersInRoom()` - 基于活跃 Socket 获取在线用户列表
- Socket 映射管理 - 自动维护 Socket 与用户的关系

#### 4. 优势

- ✅ **实时准确**：直接基于 Socket 连接状态
- ✅ **无竞态条件**：不依赖数据库异步操作
- ✅ **支持多连接**：同一用户可以有多个 Socket 连接
- ✅ **自动清理**：Socket 断开自动减少计数
- ✅ **简化逻辑**：移除复杂的数据库状态同步

## 总结

通过这些修复，服务现在能够：

- ✅ 优雅处理 WebSocket 断开连接时的错误
- ✅ 防止"Member not found"错误导致的服务崩溃
- ✅ 提供详细的日志记录用于调试
- ✅ 在遇到错误时继续为其他用户提供服务
- ✅ 自动清理资源，防止内存泄漏
- ✅ **准确的实时在线人数统计**（基于 Socket 连接状态）
