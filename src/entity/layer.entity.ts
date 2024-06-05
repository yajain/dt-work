import { Entity,Column,PrimaryGeneratedColumn,CreateDateColumn,UpdateDateColumn } from "typeorm";

@Entity()
export class Layer {
    @PrimaryGeneratedColumn()
    layer_id: number;

    @Column("varchar", { length: 30, unique:true })
    layer_name: string

    @Column("int")
    min_zoom: number;

    @Column("int")
    max_zoom: number;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}