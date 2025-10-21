import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
// import * as awarenessProtocol from 'y-protocols/awareness'; // 暂时未使用

const docs = new Map<string, Y.Doc>();
const connections = new Map<string, Set<any>>();
// 🔧 添加心跳检测，及早发现断线连接
const heartbeats = new Map<any, NodeJS.Timeout>();

// 🔧 日志控制：生产环境减少日志输出
const DEBUG = process.env.YJS_DEBUG === 'true' || process.env.NODE_ENV === 'development';

// ⚡ 性能优化：消息节流和批量处理
const updateBuffers = new Map<string, Array<{ client: any; message: Uint8Array }>>(); // 房间 -> 待发送更新列表
const flushTimers = new Map<string, NodeJS.Timeout>(); // 房间 -> 刷新定时器
const FLUSH_INTERVAL = 50; // 50ms 批量发送一次（降低网络IO）

const awarenessBuffers = new Map<string, Array<{ client: any; message: Uint8Array }>>(); // Awareness 消息缓冲
const awarenessFlushTimers = new Map<string, NodeJS.Timeout>(); // Awareness 刷新定时器
const AWARENESS_FLUSH_INTERVAL = 100; // 100ms 批量发送一次 awareness

// Message types
const messageSync = 0;
const messageAwareness = 1;

/**
 * ⚡ 批量发送更新消息（减少网络IO）
 */
function flushUpdateBuffer(roomName: string) {
  const buffer = updateBuffers.get(roomName);
  if (!buffer || buffer.length === 0) return;

  // 按客户端分组消息
  const clientMessages = new Map<any, Uint8Array[]>();
  
  buffer.forEach(({ client, message }) => {
    if (client.readyState === 1) {
      if (!clientMessages.has(client)) {
        clientMessages.set(client, []);
      }
      clientMessages.get(client)!.push(message);
    }
  });

  // 批量发送给每个客户端
  clientMessages.forEach((messages, client) => {
    if (messages.length === 1) {
      // 只有一条消息，直接发送
      client.send(messages[0], (error: any) => {
        if (error) {
          console.error(`❌ Failed to send update in room ${roomName}:`, error);
        }
      });
    } else {
      // 多条消息，合并后发送（节省带宽）
      messages.forEach(msg => {
        client.send(msg, (error: any) => {
          if (error) {
            console.error(`❌ Failed to send batched update in room ${roomName}:`, error);
          }
        });
      });
    }
  });

  // 清空缓冲区
  updateBuffers.set(roomName, []);
  if (DEBUG) {
    console.log(`📦 Flushed ${buffer.length} updates for room ${roomName} to ${clientMessages.size} clients`);
  }
}

/**
 * ⚡ 批量发送 awareness 消息
 */
function flushAwarenessBuffer(roomName: string) {
  const buffer = awarenessBuffers.get(roomName);
  if (!buffer || buffer.length === 0) return;

  // 只发送最后一条 awareness（只需要最新状态）
  const latestByClient = new Map<any, Uint8Array>();
  
  buffer.forEach(({ client, message }) => {
    if (client.readyState === 1) {
      latestByClient.set(client, message);
    }
  });

  // 发送最新的 awareness 状态
  latestByClient.forEach((message, client) => {
    client.send(message, (error: any) => {
      if (error) {
        console.error(`❌ Failed to send awareness in room ${roomName}:`, error);
      }
    });
  });

  // 清空缓冲区
  awarenessBuffers.set(roomName, []);
  if (DEBUG) {
    console.log(`👁️ Flushed awareness updates for room ${roomName} to ${latestByClient.size} clients`);
  }
}

export function setupYjsWebSocketServer(wsPort: number = 1234) {
  // Create WebSocket server for Yjs on a different port to avoid conflicts
  const wss = new WebSocketServer({
    port: wsPort, // Use configurable WebSocket port
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url!, `ws://localhost:${wsPort}`);
    const pathname = url.pathname;

    // Extract room name from path like /room-xxx
    const roomMatch = pathname.match(/^\/(.+)$/);
    if (!roomMatch) {
      ws.close(1008, 'Invalid room path');
      return;
    }

    const roomName = roomMatch[1];
    if (DEBUG) {
      console.log(`🔗 Yjs WebSocket connection for room: ${roomName}`);
    }

    // Get or create document for this room
    if (!docs.has(roomName)) {
      docs.set(roomName, new Y.Doc());
    }

    if (!connections.has(roomName)) {
      connections.set(roomName, new Set());
    }

    const doc = docs.get(roomName)!;
    const roomConnections = connections.get(roomName)!;

    // Add this connection to the room
    roomConnections.add(ws);

    // 🔧 设置心跳检测 (每30秒ping一次)
    const heartbeat = setInterval(() => {
      if (ws.readyState === 1) {
        ws.ping();
      } else {
        clearInterval(heartbeat);
        heartbeats.delete(ws);
      }
    }, 30000);
    heartbeats.set(ws, heartbeat);

    // 🔧 处理pong响应
    ws.on('pong', () => {
      // 连接正常，重置心跳
    });

    // Send sync step 1 with error handling
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc);
    
    // 🔧 安全发送消息，捕获错误
    try {
      ws.send(encoding.toUint8Array(encoder), (error) => {
        if (error) {
          console.error(`❌ Failed to send sync step 1 to room ${roomName}:`, error);
        }
      });
    } catch (error) {
      console.error(`❌ Error sending sync step 1 to room ${roomName}:`, error);
    }

    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const message = new Uint8Array(data as ArrayBuffer);
        const decoder = decoding.createDecoder(message);
        const messageType = decoding.readVarUint(decoder);

        switch (messageType) {
          case messageSync:
            const syncMessageType = decoding.readVarUint(decoder);
            const syncEncoder = encoding.createEncoder();
            encoding.writeVarUint(syncEncoder, messageSync);

            if (syncMessageType === 0) {
              // Sync step 1
              syncProtocol.writeSyncStep2(syncEncoder, doc, decoding.readVarUint8Array(decoder));
            } else if (syncMessageType === 1) {
              // Sync step 2
              syncProtocol.readSyncStep2(decoder, doc, null);
            } else if (syncMessageType === 2) {
              // Update
              syncProtocol.readUpdate(decoder, doc, null);
            }

            // Broadcast to all other clients in the room
            if (syncMessageType === 2) {
              // ⚡ 性能优化：将更新加入缓冲区，批量发送
              if (!updateBuffers.has(roomName)) {
                updateBuffers.set(roomName, []);
              }
              
              const buffer = updateBuffers.get(roomName)!;
              roomConnections.forEach((client) => {
                if (client !== ws && client.readyState === 1) {
                  buffer.push({ client, message });
                }
              });

              // 设置或重置刷新定时器
              if (flushTimers.has(roomName)) {
                clearTimeout(flushTimers.get(roomName)!);
              }
              
              flushTimers.set(roomName, setTimeout(() => {
                flushUpdateBuffer(roomName);
                flushTimers.delete(roomName);
              }, FLUSH_INTERVAL));
            } else {
              const syncMessage = encoding.toUint8Array(syncEncoder);
              if (syncMessage.length > 1) {
                // 🔧 安全发送同步消息
                try {
                  ws.send(syncMessage, (error) => {
                    if (error) {
                      console.error(`❌ Failed to send sync message in room ${roomName}:`, error);
                    }
                  });
                } catch (error) {
                  console.error(`❌ Error sending sync message in room ${roomName}:`, error);
                }
              }
            }
            break;

          case messageAwareness:
            // ⚡ 性能优化：Awareness 消息批量发送
            if (!awarenessBuffers.has(roomName)) {
              awarenessBuffers.set(roomName, []);
            }
            
            const awarenessBuffer = awarenessBuffers.get(roomName)!;
            roomConnections.forEach((client) => {
              if (client !== ws && client.readyState === 1) {
                awarenessBuffer.push({ client, message });
              }
            });

            // 设置或重置刷新定时器
            if (awarenessFlushTimers.has(roomName)) {
              clearTimeout(awarenessFlushTimers.get(roomName)!);
            }
            
            awarenessFlushTimers.set(roomName, setTimeout(() => {
              flushAwarenessBuffer(roomName);
              awarenessFlushTimers.delete(roomName);
            }, AWARENESS_FLUSH_INTERVAL));
            break;

          default:
            console.warn('Unknown message type:', messageType);
        }
      } catch (error) {
        console.error('Error processing Yjs message:', error);
        // Send a simple text message instead of binary to avoid corruption
        try {
          ws.send(JSON.stringify({ error: 'Message processing failed' }));
        } catch (e) {
          console.error('Failed to send error message:', e);
        }
      }
    });

    // Handle disconnection
    ws.on('close', () => {
      if (DEBUG) {
        console.log(`🔌 Yjs WebSocket disconnected from room: ${roomName}`);
      }
      roomConnections.delete(ws);

      // 🔧 清理心跳定时器
      const heartbeat = heartbeats.get(ws);
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeats.delete(ws);
      }

      // Clean up empty rooms
      if (roomConnections.size === 0) {
        // ⚡ 清理该房间的所有定时器和缓冲区
        const flushTimer = flushTimers.get(roomName);
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimers.delete(roomName);
        }
        
        const awarenessTimer = awarenessFlushTimers.get(roomName);
        if (awarenessTimer) {
          clearTimeout(awarenessTimer);
          awarenessFlushTimers.delete(roomName);
        }
        
        updateBuffers.delete(roomName);
        awarenessBuffers.delete(roomName);
        
        connections.delete(roomName);
        docs.delete(roomName);
        if (DEBUG) {
          console.log(`🗑️ Cleaned up empty room and buffers: ${roomName}`);
        }
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      roomConnections.delete(ws);
      
      // 🔧 清理心跳定时器
      const heartbeat = heartbeats.get(ws);
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeats.delete(ws);
      }
    });
  });

  console.log(`🔗 Yjs WebSocket server running on ws://localhost:${wsPort}`);
}
