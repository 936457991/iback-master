// Import polyfills first
import './polyfills';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { setupYjsWebSocketServer } from './yjs-websocket-server';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { seed } from './scripts/seed';
import { config, validateConfig, printConfig, serverConfig, wsConfig, corsConfig } from './config';

async function bootstrap() {
  // 验证配置
  validateConfig();
  
  // 打印配置信息
  printConfig();

  // 只在开发环境或明确指定时运行种子脚本
  if (config.server.nodeEnv === 'development' || process.env.RUN_SEED === 'true') {
    await seed();
  }
  
  const app = await NestFactory.create(AppModule);

  // Enable CORS
  const origins = corsConfig.origins === '*' ? true : corsConfig.origins.split(',');
  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  });

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // WebSocket adapter
  app.useWebSocketAdapter(new IoAdapter(app));

  const server = await app.listen(serverConfig.port, serverConfig.host);

  // Setup Yjs WebSocket server for collaborative editing
  setupYjsWebSocketServer(wsConfig.port);

  console.log(`🚀 Application is running on: http://${serverConfig.host}:${serverConfig.port}`);
  console.log(`🔌 WebSocket server running on: ws://${wsConfig.host}:${wsConfig.port}`);
}

bootstrap();
