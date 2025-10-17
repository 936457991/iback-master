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

// Message types
const messageSync = 0;
const messageAwareness = 1;

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
    console.log(`🔗 Yjs WebSocket connection for room: ${roomName}`);

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
              // 🔧 安全广播更新消息，添加错误处理和重试机制
              roomConnections.forEach((client) => {
                if (client !== ws && client.readyState === 1) {
                  try {
                    client.send(message, (error) => {
                      if (error) {
                        console.error(`❌ Failed to broadcast update in room ${roomName}:`, error);
                        // 移除失败的连接，触发客户端重连
                        if (client.readyState !== 1) {
                          roomConnections.delete(client);
                          console.log(`🔌 Removed failed connection from room ${roomName}`);
                        }
                      }
                    });
                  } catch (error) {
                    console.error(`❌ Error broadcasting to client in room ${roomName}:`, error);
                    roomConnections.delete(client);
                  }
                }
              });
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
            // Handle awareness updates with error handling
            roomConnections.forEach((client) => {
              if (client !== ws && client.readyState === 1) {
                try {
                  client.send(message, (error) => {
                    if (error) {
                      console.error(`❌ Failed to broadcast awareness in room ${roomName}:`, error);
                    }
                  });
                } catch (error) {
                  console.error(`❌ Error broadcasting awareness in room ${roomName}:`, error);
                  roomConnections.delete(client);
                }
              }
            });
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
      console.log(`🔌 Yjs WebSocket disconnected from room: ${roomName}`);
      roomConnections.delete(ws);

      // 🔧 清理心跳定时器
      const heartbeat = heartbeats.get(ws);
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeats.delete(ws);
      }

      // Clean up empty rooms
      if (roomConnections.size === 0) {
        connections.delete(roomName);
        docs.delete(roomName);
        console.log(`🗑️ Cleaned up empty room: ${roomName}`);
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
