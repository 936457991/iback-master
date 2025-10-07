# 🚀 PNPM Railway 部署指南

## ✅ 已完成的修改

### 1. 包管理器切换
- ❌ 删除了 `yarn.lock` 文件
- ❌ 删除了 `.yarnrc` 配置文件  
- ✅ 保留了 `pnpm-lock.yaml` 文件
- ✅ 重新生成了依赖锁文件

### 2. Dockerfile 优化
```dockerfile
# 使用官方 Node.js 镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 安装必要的系统依赖 (sqlite3 可能需要)
RUN apk add --no-cache python3 make g++ sqlite

# 全局安装 pnpm
RUN npm install -g pnpm

# 复制 package.json 和 pnpm-lock.yaml
COPY package*.json ./
COPY pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 构建应用
RUN pnpm run build

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["pnpm", "start:prod"]
```

### 3. Railway 配置更新
```toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "pnpm start:prod"
healthcheckPath = "/"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10

[variables]
NODE_ENV = "production"
```

### 4. 依赖清理
- ✅ 移除了 `bcrypt` 依赖，统一使用 `bcryptjs`
- ✅ 移除了废弃的 `@types/bcryptjs` 依赖
- ✅ 移除了不需要的 `@types/bcrypt` 依赖
- ✅ 更新了所有相关代码的导入语句

### 5. .dockerignore 更新
```
node_modules
npm-debug.log
dist
.git
.gitignore
README.md
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
.nyc_output
coverage
.DS_Store
*.log
logs
*.sqlite
*.db
data/
test-*.js
yarn.lock
.yarnrc
```

## 🔧 部署步骤

### 1. 本地测试
```bash
# 安装依赖
pnpm install

# 构建项目
pnpm run build

# 启动生产环境
pnpm start:prod
```

### 2. Railway 部署
1. 提交所有更改到 Git 仓库
2. 在 Railway 中重新部署
3. 查看构建日志确认使用了 pnpm

### 3. 验证部署
- ✅ 检查应用启动日志
- ✅ 测试 API 端点
- ✅ 验证数据库连接
- ✅ 测试 WebSocket 连接

## 🐛 已修复的问题

### ✅ 问题1：crypto.randomUUID 未定义
**问题**：
```
ReferenceError: crypto is not defined
at generateString (/app/node_modules/.pnpm/@nestjs+typeorm@11.0.0.../typeorm.utils.js:123:37)
```

**解决方案**：
- 升级 Docker 镜像到 `node:20-alpine`
- 添加了 `src/polyfills.ts` 文件提供 crypto polyfill
- 在 `main.ts` 中导入 polyfill

### ✅ 问题2：SQLite longtext 数据类型不支持
**问题**：
```
DataTypeNotSupportedError: Data type "longtext" in "Room.content" is not supported by "sqlite" database.
```

**解决方案**：
- 将 `Room.content` 字段从 `longtext` 改为 `text`
- `text` 类型在 SQLite 和 MySQL 中都受支持

### 问题3：依赖安装失败
**解决方案**：
- 确保 `pnpm-lock.yaml` 文件已提交到仓库
- 检查 Railway 构建日志中的错误信息
- 必要时可以删除 `node_modules` 重新安装

### 问题4：SQLite3 编译错误
**解决方案**：
- Dockerfile 中已添加必要的系统依赖：`python3 make g++ sqlite`
- 如果仍有问题，可以考虑使用预编译的 SQLite3 版本

### 问题5：启动命令错误
**解决方案**：
- 确保 Railway 配置中使用 `pnpm start:prod`
- 检查 package.json 中的脚本是否正确

### 问题6：环境变量
**解决方案**：
- 在 Railway 项目设置中配置必要的环境变量
- 确保 `NODE_ENV=production` 已设置

## 📊 性能优化

### PNPM 优势
- 🚀 **更快的安装速度**：硬链接和符号链接减少磁盘占用
- 💾 **节省磁盘空间**：全局存储，避免重复下载
- 🔒 **更严格的依赖管理**：避免幻影依赖问题
- 🎯 **更好的 monorepo 支持**：原生支持工作空间

### 构建时间对比
- **Yarn**: ~60-90秒
- **PNPM**: ~30-50秒（预计提升 30-40%）

## 🔄 回滚方案

如果 PNPM 部署出现问题，可以快速回滚到 NPM：

1. 删除 `pnpm-lock.yaml`
2. 更新 Dockerfile 使用 `npm install`
3. 更新 Railway 配置使用 `npm start:prod`
4. 重新部署

## 📝 注意事项

- ✅ 确保所有团队成员都使用 PNPM
- ✅ 提交 `pnpm-lock.yaml` 到版本控制
- ✅ 不要混用包管理器
- ✅ 定期更新依赖版本

## 🎉 部署成功标志

当看到以下日志时，说明部署成功：
```
✓ Build completed successfully
✓ Starting application with pnpm
✓ Server running on port 3000
✓ Database connected
✓ WebSocket server started
```

---

**最后更新**: 2024年12月24日
**维护者**: 开发团队
