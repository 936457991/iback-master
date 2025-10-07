import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { RoomMember } from './room-member.entity';

export enum RoomStatus {
  NORMAL = 'normal',
  ENDED = 'ended',
}

@Entity('rooms')
export class Room {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ unique: true, nullable: true })
  roomCode: string; // 6位房间号

  @Column({ nullable: true })
  password: string; // 房间密码（可选）

  @Column({
    type: 'varchar',
    default: RoomStatus.NORMAL,
  })
  status: RoomStatus;

  @Column({ type: 'longtext', nullable: true })
  content: string;

  @Column({ default: 'javascript' })
  language: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => RoomMember, (roomMember) => roomMember.room, {
    cascade: true,
  })
  members: RoomMember[];

  // Transient property for socket-based online count
  onlineCount?: number;
}
