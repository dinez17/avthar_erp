import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@tiles-erp/config';
import type { CatalogItem, Paginated } from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import {
  CreateBrandCommand,
  CreateCategoryCommand,
  CreateCollectionCommand,
  CreateSeriesCommand,
  DeleteBrandCommand,
  DeleteCategoryCommand,
  DeleteCollectionCommand,
  DeleteSeriesCommand,
  UpdateBrandCommand,
  UpdateCategoryCommand,
  UpdateCollectionCommand,
  UpdateSeriesCommand,
} from '../application/catalog.commands';
import {
  ListBrandsQuery,
  ListCategoriesQuery,
  ListCollectionsQuery,
  ListSeriesQuery,
} from '../application/catalog.queries';
import { CatalogListQueryDto, CreateCatalogDto, UpdateCatalogDto } from './dto/catalog.dto';

@ApiTags('Categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CATEGORY_READ)
  @ApiOperation({ summary: 'List categories' })
  list(@Query() query: CatalogListQueryDto): Promise<Paginated<CatalogItem>> {
    return this.queryBus.execute(new ListCategoriesQuery(query, query.parentId));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CATEGORY_CREATE)
  @ApiOperation({ summary: 'Create a category' })
  create(@Body() dto: CreateCatalogDto, @CurrentUser('id') actorId: string): Promise<CatalogItem> {
    return this.commandBus.execute(new CreateCategoryCommand(dto, actorId));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CATEGORY_UPDATE)
  @ApiOperation({ summary: 'Update a category' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogDto,
    @CurrentUser('id') actorId: string,
  ): Promise<CatalogItem> {
    return this.commandBus.execute(new UpdateCategoryCommand(id, dto, actorId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.CATEGORY_DELETE)
  @ApiOperation({ summary: 'Soft-delete a category' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: boolean }> {
    await this.commandBus.execute(new DeleteCategoryCommand(id, actorId));
    return { success: true };
  }
}

@ApiTags('Brands')
@ApiBearerAuth()
@Controller('brands')
export class BrandsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.BRAND_READ)
  @ApiOperation({ summary: 'List brands' })
  list(@Query() query: CatalogListQueryDto): Promise<Paginated<CatalogItem>> {
    return this.queryBus.execute(new ListBrandsQuery(query, query.parentId));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.BRAND_CREATE)
  @ApiOperation({ summary: 'Create a brand' })
  create(@Body() dto: CreateCatalogDto, @CurrentUser('id') actorId: string): Promise<CatalogItem> {
    return this.commandBus.execute(new CreateBrandCommand(dto, actorId));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.BRAND_UPDATE)
  @ApiOperation({ summary: 'Update a brand' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogDto,
    @CurrentUser('id') actorId: string,
  ): Promise<CatalogItem> {
    return this.commandBus.execute(new UpdateBrandCommand(id, dto, actorId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.BRAND_DELETE)
  @ApiOperation({ summary: 'Soft-delete a brand' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: boolean }> {
    await this.commandBus.execute(new DeleteBrandCommand(id, actorId));
    return { success: true };
  }
}

@ApiTags('Series')
@ApiBearerAuth()
@Controller('series')
export class SeriesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SERIES_READ)
  @ApiOperation({ summary: 'List series' })
  list(@Query() query: CatalogListQueryDto): Promise<Paginated<CatalogItem>> {
    return this.queryBus.execute(new ListSeriesQuery(query, query.parentId));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SERIES_CREATE)
  @ApiOperation({ summary: 'Create a series' })
  create(@Body() dto: CreateCatalogDto, @CurrentUser('id') actorId: string): Promise<CatalogItem> {
    return this.commandBus.execute(new CreateSeriesCommand(dto, actorId));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SERIES_UPDATE)
  @ApiOperation({ summary: 'Update a series' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogDto,
    @CurrentUser('id') actorId: string,
  ): Promise<CatalogItem> {
    return this.commandBus.execute(new UpdateSeriesCommand(id, dto, actorId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.SERIES_DELETE)
  @ApiOperation({ summary: 'Soft-delete a series' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: boolean }> {
    await this.commandBus.execute(new DeleteSeriesCommand(id, actorId));
    return { success: true };
  }
}

@ApiTags('Collections')
@ApiBearerAuth()
@Controller('collections')
export class CollectionsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COLLECTION_READ)
  @ApiOperation({ summary: 'List collections' })
  list(@Query() query: CatalogListQueryDto): Promise<Paginated<CatalogItem>> {
    return this.queryBus.execute(new ListCollectionsQuery(query, query.parentId));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.COLLECTION_CREATE)
  @ApiOperation({ summary: 'Create a collection' })
  create(@Body() dto: CreateCatalogDto, @CurrentUser('id') actorId: string): Promise<CatalogItem> {
    return this.commandBus.execute(new CreateCollectionCommand(dto, actorId));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.COLLECTION_UPDATE)
  @ApiOperation({ summary: 'Update a collection' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogDto,
    @CurrentUser('id') actorId: string,
  ): Promise<CatalogItem> {
    return this.commandBus.execute(new UpdateCollectionCommand(id, dto, actorId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.COLLECTION_DELETE)
  @ApiOperation({ summary: 'Soft-delete a collection' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: boolean }> {
    await this.commandBus.execute(new DeleteCollectionCommand(id, actorId));
    return { success: true };
  }
}
