// Yjs 相关库的类型声明文件
// 用于解决 TypeScript 编译时找不到类型声明的问题

declare module 'lib0/encoding' {
  export function createEncoder(): any;
  export function writeVarUint(encoder: any, value: number): void;
  export function toUint8Array(encoder: any): Uint8Array;
}

declare module 'lib0/decoding' {
  export function createDecoder(data: Uint8Array): any;
  export function readVarUint(decoder: any): number;
  export function readVarUint8Array(decoder: any): Uint8Array;
}

declare module 'y-protocols/sync' {
  export function writeSyncStep1(encoder: any, doc: any): void;
  export function writeSyncStep2(encoder: any, doc: any, data: Uint8Array): void;
  export function readSyncStep2(decoder: any, doc: any, transactionOrigin: any): void;
  export function readUpdate(decoder: any, doc: any, transactionOrigin: any): void;
}

declare module 'y-protocols/awareness' {
  // 如果将来需要使用 awareness 协议，可以在这里添加类型声明
  export function applyAwarenessUpdate(awareness: any, update: Uint8Array, origin: any): void;
  export function encodeAwarenessUpdate(awareness: any, clients: number[]): Uint8Array;
}
