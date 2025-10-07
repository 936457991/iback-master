# 使用官方 Node.js 镜像 (更新版本以支持 crypto.randomUUID)
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 安装必要的系统依赖 (MySQL 客户端编译需要)
RUN apk add --no-cache python3 make g++

# 全局安装 pnpm
RUN npm install -g pnpm

# 复制 package.json 和 pnpm-lock.yaml
COPY package*.json ./
COPY pnpm-lock.yaml ./

# 安装依赖 - 使用 --no-frozen-lockfile 以防止同步问题
RUN pnpm install --no-frozen-lockfile

# 复制源代码
COPY . .

# 构建应用
RUN pnpm run build

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["pnpm", "start:prod"]
