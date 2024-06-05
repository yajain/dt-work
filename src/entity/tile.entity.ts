import { Entity,Column,PrimaryGeneratedColumn,CreateDateColumn,UpdateDateColumn } from "typeorm";

@Entity()
export class Tile {
    @PrimaryGeneratedColumn()
    tile_id: number;

    @Column("int")
    x: number;

    @Column("int")
    y: number;

    @Column("int")
    z: number;

    @Column("varchar", { length: 30 })
    layer_name: string

    @Column('int')
    client_id: number;

    @Column('timestamp')
    updated_at: Date;

    // Add relationship to layer (?)
}
