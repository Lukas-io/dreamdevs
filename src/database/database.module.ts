import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ActivityEntity } from '../ingestion/entities/activity.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        const databaseUrl = config.get<string>('DATABASE_URL');

        const shared = {
          type: 'postgres' as const,
          entities: [ActivityEntity],
          synchronize: true,
          // Connection pooling — prevents exhaustion under concurrent load
          extra: {
            min: 2,
            max: 20,
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 2_000,
          },
        };

        // Render supplies DATABASE_URL — individual vars used for local dev
        if (databaseUrl) {
          return { ...shared, url: databaseUrl, ssl: { rejectUnauthorized: false } };
        }

        return {
          ...shared,
          host: config.get<string>('database.host'),
          port: config.get<number>('database.port'),
          username: config.get<string>('database.username'),
          password: config.get<string>('database.password'),
          database: config.get<string>('database.name'),
        };
      },
    }),
  ],
})
export class DatabaseModule {}
