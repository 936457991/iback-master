import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Room } from './room.entity';

export enum RoomMemberRole {
  ADMIN = 'admin',
  MEMBER = 'member',
}

@Entity('room_members')
export class RoomMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  roomId: string;

  @Column({
    type: 'varchar',
    default: RoomMemberRole.MEMBER,
  })
  role: RoomMemberRole;

  @Column({ default: false })
  isOnline: boolean;

  @Column({ type: 'datetime', nullable: true })
  lastActiveAt: Date;

  @CreateDateColumn()
  joinedAt: Date;

  @ManyToOne(() => User, (user) => user.roomMemberships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Room, (room) => room.members, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'roomId' })
  room: Room;
}
