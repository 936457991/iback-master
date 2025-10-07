import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RoomsModule } from './rooms/rooms.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { DatabaseModule } from './database/database.module';
import { LoggerModule } from './common/logger/logger.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InitializationService } from './common/services/initialization.service';

@Module({
  imports: [
    LoggerModule,
    DatabaseModule,
    AuthModule,
    UsersModule,
    RoomsModule,
    CollaborationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    InitializationService,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
