import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
// import * as awarenessProtocol from 'y-protocols/awareness'; // 暂时未使用

const docs = new Map<string, Y.Doc>();
const connections = new Map<string, Set<any>>();

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

    // Send sync step 1
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc);
    ws.send(encoding.toUint8Array(encoder));

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
              roomConnections.forEach((client) => {
                if (client !== ws && client.readyState === 1) {
                  client.send(message);
                }
              });
            } else {
              const syncMessage = encoding.toUint8Array(syncEncoder);
              if (syncMessage.length > 1) {
                ws.send(syncMessage);
              }
            }
            break;

          case messageAwareness:
            // Handle awareness updates
            roomConnections.forEach((client) => {
              if (client !== ws && client.readyState === 1) {
                client.send(message);
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
    });
  });

  console.log(`🔗 Yjs WebSocket server running on ws://localhost:${wsPort}`);
}
