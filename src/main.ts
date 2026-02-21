import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import * as compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security headers — sets X-Content-Type-Options, X-Frame-Options, etc.
  app.use(helmet({ contentSecurityPolicy: false }));

  // Gzip compression — reduces response size for large JSON payloads
  app.use(compression());

  // Global validation — strips unknown fields from request bodies
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  // Global exception filter — sanitised errors, no stack traces exposed
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Graceful shutdown — lets in-flight requests finish and closes DB connections cleanly
  app.enableShutdownHooks();

  // Swagger OpenAPI document
  const config = new DocumentBuilder()
    .setTitle('Merchant Intelligence API')
    .setDescription(
      'A high-performance analytics API that ingests a year of merchant activity logs ' +
        "across Moniepoint's product ecosystem and exposes key business insights. " +
        'All results are pre-computed at startup for sub-millisecond response times.',
    )
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-json', app, document, { jsonDocumentUrl: '/api-json' });

  // Scalar API reference UI
  app.use(
    '/docs',
    apiReference({
      spec: { content: document },
      theme: 'purple',
      pageTitle: 'Merchant Intelligence API',
    }),
  );

  const port = process.env.PORT || 8080;
  await app.listen(port);
  console.log(`\n🚀 API running on http://localhost:${port}`);
  console.log(`📖 API docs    → http://localhost:${port}/docs`);
  console.log(`🏥 Health      → http://localhost:${port}/health\n`);
}
bootstrap();
