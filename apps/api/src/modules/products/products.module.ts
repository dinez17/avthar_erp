import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PRODUCTS_REPOSITORY } from './domain/products.repository';
import { BRANCH_PRICES_REPOSITORY } from './domain/branch-prices.repository';
import { PrismaProductsRepository } from './infrastructure/prisma-products.repository';
import { PrismaBranchPricesRepository } from './infrastructure/prisma-branch-prices.repository';
import { ProductsController } from './presentation/products.controller';
import { BranchPricesController } from './presentation/branch-prices.controller';
import {
  BulkUpdateProductRatesHandler,
  CreateProductHandler,
  DeleteProductHandler,
  GetProductHandler,
  ListProductsHandler,
  ListProductSizesHandler,
  UpdateProductHandler,
} from './application/products.handlers';
import {
  BulkUpdateBranchPricesHandler,
  ListBranchPricesHandler,
} from './application/branch-prices.handlers';

/** Product master: UOM (box/piece/sqft), HSN, GST, barcode, catalog references. */
@Module({
  imports: [CqrsModule],
  controllers: [ProductsController, BranchPricesController],
  providers: [
    { provide: PRODUCTS_REPOSITORY, useClass: PrismaProductsRepository },
    { provide: BRANCH_PRICES_REPOSITORY, useClass: PrismaBranchPricesRepository },
    ListProductsHandler,
    ListProductSizesHandler,
    GetProductHandler,
    CreateProductHandler,
    UpdateProductHandler,
    DeleteProductHandler,
    BulkUpdateProductRatesHandler,
    ListBranchPricesHandler,
    BulkUpdateBranchPricesHandler,
  ],
})
export class ProductsModule {}
