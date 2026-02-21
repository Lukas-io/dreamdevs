import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('activities')
export class ActivityEntity {
  @PrimaryColumn('uuid')
  event_id: string;

  @Column({ type: 'varchar' })
  merchant_id: string;

  @Column({ type: 'timestamp', nullable: true })
  event_timestamp: Date | null;

  @Column({ type: 'varchar' })
  product: string;

  @Column({ type: 'varchar' })
  event_type: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  amount: number;

  @Column({ type: 'varchar' })
  status: string;

  @Column({ type: 'varchar', nullable: true })
  channel: string;

  @Column({ type: 'varchar', nullable: true })
  region: string;

  @Column({ type: 'varchar', nullable: true })
  merchant_tier: string;
}
