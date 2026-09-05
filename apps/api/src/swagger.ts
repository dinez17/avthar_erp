import { type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Mounts the OpenAPI/Swagger UI at `<globalPrefix>/docs`. */
export function setupSwagger(app: INestApplication, globalPrefix: string): void {
  const config = new DocumentBuilder()
    .setTitle('Tiles ERP API')
    .setDescription('Enterprise Tiles ERP - REST API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addTag('Authentication')
    .addTag('Users')
    .addTag('Roles')
    .addTag('Departments')
    .addTag('Companies')
    .addTag('Branches')
    .addTag('Godowns')
    .addTag('Gates')
    .addTag('Racks')
    .addTag('Settings')
    .addTag('Audit')
    .addTag('Categories')
    .addTag('Brands')
    .addTag('Series')
    .addTag('Collections')
    .addTag('Products')
    .addTag('Branch prices')
    .addTag('Customers')
    .addTag('Suppliers')
    .addTag('Transporters')
    .addTag('Vehicles')
    .addTag('Drivers')
    .addTag('Stock')
    .addTag('Stock transfers')
    .addTag('Stock reports')
    .addTag('Purchase orders')
    .addTag('Goods receipts')
    .addTag('Purchase invoices')
    .addTag('Purchase returns')
    .addTag('Quotations')
    .addTag('Health')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${globalPrefix}/docs`, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
