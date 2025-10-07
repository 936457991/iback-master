# 自动创建默认管理员功能

## 功能说明

当后端应用启动时，系统会自动检查数据库中是否存在用户名为 `admin` 的管理员账户。如果不存在，系统会自动创建一个默认的管理员账户。

## 默认管理员账户信息

- **用户名**: `admin`
- **密码**: `admin123`
- **角色**: `admin` (管理员)
- **状态**: `active` (激活)

## 工作原理

1. 应用启动时，`InitializationService` 会在 `onModuleInit` 生命周期钩子中执行初始化逻辑
2. 系统调用 `UsersService.createDefaultAdmin()` 方法
3. 该方法会检查数据库中是否已存在用户名为 `admin` 的用户
4. 如果不存在，则创建默认管理员账户
5. 如果已存在，则跳过创建过程

## 日志输出

- **创建成功**: `✅ Default admin user created: admin / admin123`
- **已存在**: `ℹ️ Default admin user already exists`
- **创建失败**: `❌ Failed to create default admin user: [错误信息]`

## 相关文件

- `src/users/users.service.ts` - 包含 `createDefaultAdmin()` 方法
- `src/common/services/initialization.service.ts` - 应用初始化服务
- `src/app.module.ts` - 注册初始化服务
- `src/scripts/seed.ts` - 数据库种子脚本（已更新为使用 .env 配置）

## 安全注意事项

⚠️ **重要**: 在生产环境中，建议在首次登录后立即修改默认管理员的密码，以确保系统安全。

## 使用方法

1. 启动应用: `npm run start` 或 `npm run start:prod`
2. 查看控制台日志，确认管理员账户创建状态
3. 使用默认账户登录: `admin` / `admin123`
4. 登录后立即修改密码

## 测试

可以通过以下方式测试登录功能：

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'
```

成功响应示例：

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "username": "admin",
    "role": "admin"
  }
}
```
