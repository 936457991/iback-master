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

  // 外部共享代码链接（可选）。存在时，前端可用该链接作为“代码界面”。
  @Column({ type: 'varchar', length: 2048, nullable: true })
  coderpadUrl?: string;

  // CoderPad 链接有效期截止时间（仅当 coderpadUrl 为 CoderPad 链接时生效）
  @Column({ type: 'datetime', nullable: true })
  coderpadExpiresAt?: Date;

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
