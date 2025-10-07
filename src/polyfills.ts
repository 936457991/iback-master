// Polyfill for crypto.randomUUID in case it's not available
const nodeCrypto = require('crypto');

// Check if crypto.randomUUID exists, if not, add a polyfill
if (!nodeCrypto.randomUUID) {
  nodeCrypto.randomUUID = () => {
    // Generate a UUID v4 using crypto.randomBytes
    const bytes = nodeCrypto.randomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10
    
    const hex = bytes.toString('hex');
    return [
      hex.substring(0, 8),
      hex.substring(8, 12),
      hex.substring(12, 16),
      hex.substring(16, 20),
      hex.substring(20, 32)
    ].join('-') as `${string}-${string}-${string}-${string}-${string}`;
  };
}

// Ensure globalThis.crypto is available
if (!globalThis.crypto) {
  (globalThis as any).crypto = nodeCrypto;
}
