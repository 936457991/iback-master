import { Injectable, OnModuleInit } from '@nestjs/common';
import { UsersService } from '../../users/users.service';

@Injectable()
export class InitializationService implements OnModuleInit {
  constructor(private readonly usersService: UsersService) {}

  async onModuleInit() {
    console.log('🚀 Initializing application...');
    
    // Create default admin user if it doesn't exist
    await this.usersService.createDefaultAdmin();
    
    console.log('✅ Application initialization completed');
  }
}
