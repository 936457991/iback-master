import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Room } from '../rooms/entities/room.entity';
import { RoomMember } from '../rooms/entities/room-member.entity';
import * as bcrypt from 'bcryptjs';

async function initProductionDatabase() {
  console.log('🚀 Initializing production database...');
  
  const dataSource = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: +process.env.DB_PORT || 3306,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    entities: [User, Room, RoomMember],
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
    charset: process.env.DB_CHARSET || 'utf8mb4',
    timezone: process.env.DB_TIMEZONE || '+08:00',
    ssl: process.env.DB_SSL === 'true' ? {
      rejectUnauthorized: false
    } : false,
  });

  try {
    await dataSource.initialize();
    console.log('✅ Database connection established');

    // 检查是否已有管理员用户
    const userRepository = dataSource.getRepository(User);
    const existingAdmin = await userRepository.findOne({
      where: { username: process.env.ADMIN_USERNAME || 'admin' }
    });

    if (!existingAdmin) {
      console.log('👤 Creating admin user...');
      
      const hashedPassword = await bcrypt.hash(
        process.env.ADMIN_PASSWORD || 'admin123',
        12
      );

      const adminUser = userRepository.create({
        username: process.env.ADMIN_USERNAME || 'admin',
        email: process.env.ADMIN_EMAIL || 'admin@example.com',
        password: hashedPassword,
        role: 'admin',
        isActive: true,
      });

      await userRepository.save(adminUser);
      console.log('✅ Admin user created successfully');
    } else {
      console.log('👤 Admin user already exists');
    }

    await dataSource.destroy();
    console.log('✅ Database initialization completed');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  initProductionDatabase();
}

export { initProductionDatabase };
