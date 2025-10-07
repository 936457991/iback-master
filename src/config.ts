/**
 * 应用配置文件
 * 集中管理所有配置项，支持环境变量覆盖
 */

export interface DatabaseConfig {
  type: 'mysql' | 'sqlite';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
  synchronize: boolean;
  logging: boolean;
  charset?: string;
  timezone?: string;
  connectionLimit?: number;
}

export interface JwtConfig {
  secret: string;
  expiresIn: string;
}

export interface ServerConfig {
  port: number;
  host: string;
  nodeEnv: string;
}

export interface WebSocketConfig {
  port: number;
  host: string;
}

export interface CorsConfig {
  origins: string;
}

export interface FeaturesConfig {
  enableRegistration: boolean;
  maxRoomMembers: number;
  roomCodeLength: number;
  autoSaveInterval: number;
}

export interface AdminConfig {
  username: string;
  password: string;
  email: string;
}

export interface LoggerConfig {
  level: string;
}

export interface AppConfig {
  server: ServerConfig;
  database: DatabaseConfig;
  jwt: JwtConfig;
  websocket: WebSocketConfig;
  cors: CorsConfig;
  features: FeaturesConfig;
  admin: AdminConfig;
  logger: LoggerConfig;
}

// 默认配置
const defaultConfig: AppConfig = {
  server: {
    port: 3000,
    host: '0.0.0.0',
    nodeEnv: 'development',
  },
  database: {
    type: 'mysql',
    host: 'gondola.proxy.rlwy.net',
    port: 39395,
    username: 'root',
    password: 'aspFqYqTuBJyeNrfTDKcRAKuYBEuQyeB',
    database: 'railway',
    ssl: {
      rejectUnauthorized: false
    },
    synchronize: true,
    logging: false,
    charset: 'utf8mb4',
    timezone: '+08:00',
    connectionLimit: 10,
  },
  jwt: {
    secret: 'interview_jwt_secret_key_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
    expiresIn: '24h',
  },
  websocket: {
    port: 1234,
    host: '0.0.0.0',
  },
  cors: {
    origins: '*',
  },
  features: {
    enableRegistration: false,
    maxRoomMembers: 10,
    roomCodeLength: 6,
    autoSaveInterval: 3000,
  },
  admin: {
    username: 'admin',
    password: 'admin123456',
    email: 'admin@example.com',
  },
  logger: {
    level: 'info',
  },
};

// 从环境变量获取配置的辅助函数
function getEnvString(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
}

// 创建最终配置，支持环境变量覆盖
function createConfig(): AppConfig {
  return {
    server: {
      port: getEnvNumber('PORT', defaultConfig.server.port),
      host: getEnvString('HOST', defaultConfig.server.host),
      nodeEnv: getEnvString('NODE_ENV', defaultConfig.server.nodeEnv),
    },
    database: {
      type: (getEnvString('DB_TYPE', 'mysql') as 'mysql' | 'sqlite'),
      host: getEnvString('DB_HOST', defaultConfig.database.host!),
      port: getEnvNumber('DB_PORT', defaultConfig.database.port!),
      username: getEnvString('DB_USERNAME', defaultConfig.database.username!),
      password: getEnvString('DB_PASSWORD', defaultConfig.database.password!),
      database: getEnvString('DB_DATABASE', defaultConfig.database.database),
      ssl: getEnvBoolean('DB_SSL', true) ? { rejectUnauthorized: false } : false,
      synchronize: getEnvBoolean('DB_SYNCHRONIZE', defaultConfig.database.synchronize),
      logging: getEnvBoolean('DB_LOGGING', defaultConfig.database.logging),
      charset: getEnvString('DB_CHARSET', defaultConfig.database.charset!),
      timezone: getEnvString('DB_TIMEZONE', defaultConfig.database.timezone!),
      connectionLimit: getEnvNumber('DB_CONNECTION_LIMIT', defaultConfig.database.connectionLimit!),
    },
    jwt: {
      secret: getEnvString('JWT_SECRET', defaultConfig.jwt.secret),
      expiresIn: getEnvString('JWT_EXPIRES_IN', defaultConfig.jwt.expiresIn),
    },
    websocket: {
      port: getEnvNumber('WS_PORT', defaultConfig.websocket.port),
      host: getEnvString('WS_HOST', defaultConfig.websocket.host),
    },
    cors: {
      origins: getEnvString('CORS_ORIGINS', defaultConfig.cors.origins),
    },
    features: {
      enableRegistration: getEnvBoolean('ENABLE_REGISTRATION', defaultConfig.features.enableRegistration),
      maxRoomMembers: getEnvNumber('MAX_ROOM_MEMBERS', defaultConfig.features.maxRoomMembers),
      roomCodeLength: getEnvNumber('ROOM_CODE_LENGTH', defaultConfig.features.roomCodeLength),
      autoSaveInterval: getEnvNumber('AUTO_SAVE_INTERVAL', defaultConfig.features.autoSaveInterval),
    },
    admin: {
      username: getEnvString('ADMIN_USERNAME', defaultConfig.admin.username),
      password: getEnvString('ADMIN_PASSWORD', defaultConfig.admin.password),
      email: getEnvString('ADMIN_EMAIL', defaultConfig.admin.email),
    },
    logger: {
      level: getEnvString('LOG_LEVEL', defaultConfig.logger.level),
    },
  };
}

// 导出配置实例
export const config = createConfig();

// 导出便捷访问器
export const dbConfig = config.database;
export const jwtConfig = config.jwt;
export const serverConfig = config.server;
export const wsConfig = config.websocket;
export const corsConfig = config.cors;
export const featuresConfig = config.features;
export const adminConfig = config.admin;
export const loggerConfig = config.logger;

// 配置验证函数
export function validateConfig(): void {
  const errors: string[] = [];

  // 验证必需的配置
  if (!config.jwt.secret || config.jwt.secret.length < 32) {
    errors.push('JWT secret must be at least 32 characters long');
  }

  if (config.database.type === 'mysql') {
    if (!config.database.host) errors.push('Database host is required for MySQL');
    if (!config.database.username) errors.push('Database username is required for MySQL');
    if (!config.database.password) errors.push('Database password is required for MySQL');
  }

  if (!config.admin.username) errors.push('Admin username is required');
  if (!config.admin.password) errors.push('Admin password is required');
  if (!config.admin.email) errors.push('Admin email is required');

  if (errors.length > 0) {
    console.error('❌ Configuration validation errors:');
    errors.forEach(error => console.error(`  - ${error}`));
    throw new Error('Invalid configuration');
  }

  console.log('✅ Configuration validation passed');
}

// 打印配置信息（隐藏敏感信息）
export function printConfig(): void {
  console.log('📋 Current Configuration:');
  console.log(`  Server: ${config.server.host}:${config.server.port} (${config.server.nodeEnv})`);
  console.log(`  Database: ${config.database.type} at ${config.database.host}:${config.database.port}/${config.database.database}`);
  console.log(`  WebSocket: ${config.websocket.host}:${config.websocket.port}`);
  console.log(`  Admin: ${config.admin.username} <${config.admin.email}>`);
  console.log(`  Features: Registration=${config.features.enableRegistration}, MaxMembers=${config.features.maxRoomMembers}`);
}
