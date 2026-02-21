import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('activities')
// Original indexes
@Index(['status', 'product'])
@Index(['merchant_id'])
@Index(['event_timestamp'])
// Composite indexes tuned for analytics queries
@Index(['merchant_id', 'status', 'product']) // top-merchant: filter + group
@Index(['event_timestamp', 'status'])         // monthly-active-merchants: filter + truncate
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
