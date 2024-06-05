import { Entity,Column,PrimaryGeneratedColumn,CreateDateColumn,UpdateDateColumn } from "typeorm";

@Entity()
export class FetchLog {
    @PrimaryGeneratedColumn()
    fetch_id: number;

    @Column()   // FK to Session ***
    session_id: string;

    @Column()   // FK to Tile ***
    tile_id: number;

    @Column()
    layer_name: string;

    @Column()
    service: string;

    @Column("")
    request_type: string;

    @Column("")
    version: string;

    @Column("")
    style: string;

    @Column("")
    mimetype: string;

    @Column("")
    tilematrix: string;

    @Column("")
    tilerow: number;

    @Column("")
    tilecol: number;

    @Column("")
    zoom: number;

    @Column('bigint')
    request_time: number;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}