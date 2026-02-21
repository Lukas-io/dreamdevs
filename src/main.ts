import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  // Swagger document
  const config = new DocumentBuilder()
    .setTitle('Merchant Intelligence API')
    .setDescription(
      'A high-performance analytics API that ingests a year of merchant activity logs ' +
      'across Moniepoint\'s product ecosystem and exposes key business insights. ' +
      'All results are pre-computed at startup for sub-millisecond response times.',
    )
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Raw OpenAPI JSON at /api-json (Scalar reads from this)
  SwaggerModule.setup('api-json', app, document, { jsonDocumentUrl: '/api-json' });

  // Scalar UI at /docs
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
