import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import {
  BRAND_REPOSITORY,
  CATEGORY_REPOSITORY,
  COLLECTION_REPOSITORY,
  SERIES_REPOSITORY,
} from './domain/catalog.repository';
import {
  PrismaBrandRepository,
  PrismaCategoryRepository,
  PrismaCollectionRepository,
  PrismaSeriesRepository,
} from './infrastructure/prisma-catalog.repositories';
import {
  BrandsController,
  CategoriesController,
  CollectionsController,
  SeriesController,
} from './presentation/catalog.controllers';
import * as handlers from './application/catalog.handlers';

/** Catalog masters: Category, Brand, Series and Collection. */
@Module({
  imports: [CqrsModule],
  controllers: [CategoriesController, BrandsController, SeriesController, CollectionsController],
  providers: [
    { provide: CATEGORY_REPOSITORY, useClass: PrismaCategoryRepository },
    { provide: BRAND_REPOSITORY, useClass: PrismaBrandRepository },
    { provide: SERIES_REPOSITORY, useClass: PrismaSeriesRepository },
    { provide: COLLECTION_REPOSITORY, useClass: PrismaCollectionRepository },
    ...Object.values(handlers),
  ],
})
export class CatalogModule {}
