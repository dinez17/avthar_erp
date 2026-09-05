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
import type { Paginated, PartyItem } from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import {
  CreateCustomerCommand,
  CreateSupplierCommand,
  DeleteCustomerCommand,
  DeleteSupplierCommand,
  GetCustomerQuery,
  GetSupplierQuery,
  ListCustomersQuery,
  ListSuppliersQuery,
  NextCustomerCodeQuery,
  NextSupplierCodeQuery,
  UpdateCustomerCommand,
  UpdateSupplierCommand,
} from '../application/party.handlers';
import { CreatePartyDto, PartyListQueryDto, UpdatePartyDto } from './dto/party.dto';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  @ApiOperation({ summary: 'List customers (search by name, code, phone, GSTIN or city)' })
  list(@Query() query: PartyListQueryDto): Promise<Paginated<PartyItem>> {
    return this.queryBus.execute(new ListCustomersQuery(query, { stateCode: query.stateCode }));
  }

  @Get('next-code')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  @ApiOperation({ summary: 'Suggest the next sequential customer code' })
  nextCode(): Promise<string> {
    return this.queryBus.execute(new NextCustomerCodeQuery());
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  @ApiOperation({ summary: 'Get a customer by id' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<PartyItem> {
    return this.queryBus.execute(new GetCustomerQuery(id));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CUSTOMER_CREATE)
  @ApiOperation({ summary: 'Create a customer' })
  create(@Body() dto: CreatePartyDto, @CurrentUser('id') actorId: string): Promise<PartyItem> {
    return this.commandBus.execute(new CreateCustomerCommand(dto, actorId));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_UPDATE)
  @ApiOperation({ summary: 'Update a customer (optimistic concurrency via version)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePartyDto,
    @CurrentUser('id') actorId: string,
  ): Promise<PartyItem> {
    return this.commandBus.execute(new UpdateCustomerCommand(id, dto, actorId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.CUSTOMER_DELETE)
  @ApiOperation({ summary: 'Soft-delete a customer' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: boolean }> {
    await this.commandBus.execute(new DeleteCustomerCommand(id, actorId));
    return { success: true };
  }
}

@ApiTags('Suppliers')
@ApiBearerAuth()
@Controller('suppliers')
export class SuppliersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SUPPLIER_READ)
  @ApiOperation({ summary: 'List suppliers (search by name, code, phone, GSTIN or city)' })
  list(@Query() query: PartyListQueryDto): Promise<Paginated<PartyItem>> {
    return this.queryBus.execute(new ListSuppliersQuery(query, { stateCode: query.stateCode }));
  }

  @Get('next-code')
  @RequirePermissions(PERMISSIONS.SUPPLIER_READ)
  @ApiOperation({ summary: 'Suggest the next sequential supplier code' })
  nextCode(): Promise<string> {
    return this.queryBus.execute(new NextSupplierCodeQuery());
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SUPPLIER_READ)
  @ApiOperation({ summary: 'Get a supplier by id' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<PartyItem> {
    return this.queryBus.execute(new GetSupplierQuery(id));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SUPPLIER_CREATE)
  @ApiOperation({ summary: 'Create a supplier' })
  create(@Body() dto: CreatePartyDto, @CurrentUser('id') actorId: string): Promise<PartyItem> {
    return this.commandBus.execute(new CreateSupplierCommand(dto, actorId));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SUPPLIER_UPDATE)
  @ApiOperation({ summary: 'Update a supplier (optimistic concurrency via version)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePartyDto,
    @CurrentUser('id') actorId: string,
  ): Promise<PartyItem> {
    return this.commandBus.execute(new UpdateSupplierCommand(id, dto, actorId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.SUPPLIER_DELETE)
  @ApiOperation({ summary: 'Soft-delete a supplier' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: boolean }> {
    await this.commandBus.execute(new DeleteSupplierCommand(id, actorId));
    return { success: true };
  }
}
