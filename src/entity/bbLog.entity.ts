import { Entity,Column,PrimaryGeneratedColumn,CreateDateColumn,UpdateDateColumn } from "typeorm";

@Entity()
export class BbLog {
    @PrimaryGeneratedColumn()
    box_id: number;

    @Column()   // FK to Session
    session_id: string;

    @Column("float")
    x1: number;

    @Column("float")
    y1: number;

    @Column("float")
    x2: number;

    @Column("float")
    y2: number;

    @Column()
    layer_name: string;

    @Column('bigint')
    request_time: number;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

    // Add relationship to layer (?)
}