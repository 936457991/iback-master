import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { RoomsService } from '../rooms/rooms.service';
import { Repository } from 'typeorm';
import { Room } from '../rooms/entities/room.entity';
import { getRepositoryToken } from '@nestjs/typeorm';

async function generateRoomCodes() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const roomsRepository = app.get<Repository<Room>>(getRepositoryToken(Room));

  try {
    // 获取所有没有房间号的房间
    const roomsWithoutCode = await roomsRepository.find({
      where: { roomCode: null }
    });

    console.log(`Found ${roomsWithoutCode.length} rooms without room codes`);

    for (const room of roomsWithoutCode) {
      // 生成6位房间号
      let roomCode: string;
      let isUnique = false;
      
      while (!isUnique) {
        roomCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        const existingRoom = await roomsRepository.findOne({
          where: { roomCode }
        });
        
        if (!existingRoom) {
          isUnique = true;
        }
      }

      // 更新房间
      await roomsRepository.update(room.id, { roomCode });
      console.log(`Generated room code ${roomCode} for room "${room.name}"`);
    }

    console.log('✅ All room codes generated successfully!');
  } catch (error) {
    console.error('❌ Error generating room codes:', error);
  } finally {
    await app.close();
  }
}

generateRoomCodes();
