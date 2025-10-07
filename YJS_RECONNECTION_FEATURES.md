# Y.js Monaco 重连功能说明

## 功能概述

为Y.js Monaco编辑器添加了完整的连接状态监控和重连机制，让用户能够清楚地感知到实时协作的连接状态，并在断线时提供重连功能。

## 主要功能

### 1. 连接状态可视化 🔄

#### 状态指示器
在页面头部显示实时的Y.js连接状态：

- **🔵 协作连接中...** - 正在建立连接
- **✅ 协作已连接** - 连接正常，实时协作可用
- **❌ 协作已断开 (点击重连)** - 连接断开，可点击手动重连
- **🟠 协作重连中...** - 正在尝试重连

#### 状态颜色说明
- **蓝色(blue)**: 正在连接
- **绿色(green)**: 连接成功
- **红色(red)**: 连接断开
- **橙色(volcano)**: 正在重连

### 2. 智能消息提示 💬

#### 连接成功
```
✅ 实时协作连接已建立 (2秒后消失)
✅ 实时协作已同步 (1秒后消失)
```

#### 连接问题
```
❌ 实时协作连接已断开，正在尝试重连... (持续显示)
⚠️ 实时协作连接已断开，正在重连... (持续显示)
❌ 实时协作连接失败，正在重试... (持续显示)
```

#### 网络错误
```
❌ 网络连接异常，实时协作已断开 (持续显示)
❌ 实时协作连接关闭 (错误代码) (持续显示)
ℹ️ 实时协作连接正常关闭 (2秒后消失)
```

### 3. 自动重连机制 🔄

#### WebSocket Provider配置
```javascript
{
  connect: true,
  disableBc: true, // 禁用二进制协议
  maxBackoffTime: 5000, // 最大退避时间5秒
  resyncInterval: 30000, // 30秒重新同步一次
}
```

#### 重连策略
- **自动重连**: Y.js WebSocket Provider内置重连机制
- **指数退避**: 重连间隔逐渐增加，最大5秒
- **定期同步**: 每30秒自动重新同步数据
- **状态监控**: 实时监控连接状态变化

### 4. 手动重连功能 🔧

#### 触发方式
- 点击红色的"协作已断开"状态标签
- 标签显示"(点击重连)"提示

#### 重连流程
1. 用户点击断开状态标签
2. 显示"正在手动重连实时协作..."
3. 断开现有连接
4. 延迟1秒后重新建立连接
5. 更新状态为"连接中"
6. 连接成功后显示成功消息

### 5. 详细错误处理 ⚠️

#### WebSocket错误代码处理
```javascript
// 网络异常
1006 -> "网络连接异常，实时协作已断开"

// 正常关闭  
1000 -> "实时协作连接正常关闭"

// 其他错误
其他 -> "实时协作连接关闭 (错误代码)"
```

#### 多层错误监听
- **Provider事件**: status, connection-error, connection-close, sync
- **WebSocket事件**: open, error, close
- **状态同步**: 监听同步状态变化

## 技术实现

### 1. 状态管理
```typescript
const [yjsConnectionStatus, setYjsConnectionStatus] = useState<
  'connecting' | 'connected' | 'disconnected' | 'reconnecting'
>('connecting');
```

### 2. 事件监听
```typescript
// Y.js Provider事件
providerRef.current.on('status', (event) => {
  if (event.status === 'connected') {
    setYjsConnectionStatus('connected');
    message.success('实时协作连接已建立', 2);
  } else if (event.status === 'disconnected') {
    setYjsConnectionStatus('disconnected');
    message.error('实时协作连接已断开，正在尝试重连...', 0);
  }
});

// WebSocket原生事件
ws.addEventListener('error', (error) => {
  setYjsConnectionStatus('reconnecting');
  message.error('实时协作连接出错，正在重试...', 3);
});
```

### 3. 手动重连实现
```typescript
const reconnectYjs = () => {
  setYjsConnectionStatus('connecting');
  message.loading('正在手动重连实时协作...', 0);
  
  if (providerRef.current) {
    providerRef.current.disconnect();
    setTimeout(() => {
      providerRef.current.connect();
    }, 1000);
  }
};
```

### 4. UI组件
```tsx
{yjsConnectionStatus === 'disconnected' && (
  <Tag 
    color="red" 
    style={{ cursor: 'pointer' }}
    onClick={reconnectYjs}
    title="点击手动重连"
  >
    ❌ 协作已断开 (点击重连)
  </Tag>
)}
```

## 用户体验改进

### 1. 视觉反馈
- **动态Loading点**: 连接和重连时显示动画效果
- **颜色编码**: 不同状态使用不同颜色区分
- **图标提示**: 使用表情符号增强可读性

### 2. 交互设计
- **点击重连**: 直观的手动重连方式
- **悬停提示**: 鼠标悬停显示操作提示
- **持久消息**: 重要错误消息不自动消失

### 3. 状态持久化
- **状态保持**: 页面刷新前保持连接状态
- **自动恢复**: 网络恢复后自动重连
- **优雅降级**: 连接失败时不影响基本编辑功能

## 兼容性说明

### 支持的功能
- ✅ 实时协作编辑
- ✅ 自动重连
- ✅ 手动重连
- ✅ 状态可视化
- ✅ 错误提示
- ✅ 离线编辑

### 降级策略
- **无网络**: 可继续本地编辑，网络恢复后自动同步
- **服务器故障**: 显示错误状态，支持手动重连
- **部分功能失效**: 基础编辑功能不受影响

## 测试场景

### 1. 正常连接
- 页面加载后显示"协作连接中"
- 连接成功后显示"协作已连接"
- 成功消息自动消失

### 2. 网络断开
- 断网后显示"协作已断开"
- 提示用户可以点击重连
- 自动尝试重连

### 3. 网络恢复
- 网络恢复后自动重连
- 显示"协作重连中"
- 连接成功后更新状态

### 4. 手动重连
- 点击断开状态标签
- 显示重连进度
- 重连成功显示成功消息

### 5. 服务器故障
- 显示具体错误信息
- 保持重连尝试
- 不影响基本编辑功能

这个重连功能确保用户在任何网络情况下都能获得最佳的协作编辑体验，同时提供清晰的状态反馈和便捷的恢复方式。
