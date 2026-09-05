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
import type {
  DriverItem,
  Paginated,
  TransporterItem,
  VehicleItem,
} from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import {
  CreateDriverCommand,
  CreateTransporterCommand,
  CreateVehicleCommand,
  DeleteDriverCommand,
  DeleteTransporterCommand,
  DeleteVehicleCommand,
  ListDriversQuery,
  ListTransportersQuery,
  ListVehiclesQuery,
  NextDriverCodeQuery,
  NextTransporterCodeQuery,
  UpdateDriverCommand,
  UpdateTransporterCommand,
  UpdateVehicleCommand,
} from '../application/logistics.handlers';
import {
  CreateDriverDto,
  CreateTransporterDto,
  CreateVehicleDto,
  LogisticsListQueryDto,
  UpdateDriverDto,
  UpdateTransporterDto,
  UpdateVehicleDto,
} from './dto/logistics.dto';

@ApiTags('Transporters')
@ApiBearerAuth()
@Controller('transporters')
export class TransportersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TRANSPORTER_READ)
  @ApiOperation({ summary: 'List transporters' })
  list(@Query() query: LogisticsListQueryDto): Promise<Paginated<TransporterItem>> {
    return this.queryBus.execute(new ListTransportersQuery(query));
  }

  @Get('next-code')
  @RequirePermissions(PERMISSIONS.TRANSPORTER_READ)
  @ApiOperation({ summary: 'Suggest the next transporter code' })
  nextCode(): Promise<string> {
    return this.queryBus.execute(new NextTransporterCodeQuery());
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TRANSPORTER_CREATE)
  @ApiOperation({ summary: 'Create a transporter' })
  create(
    @Body() dto: CreateTransporterDto,
    @CurrentUser('id') actorId: string,
  ): Promise<TransporterItem> {
    return this.commandBus.execute(new CreateTransporterCommand(dto, actorId));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TRANSPORTER_UPDATE)
  @ApiOperation({ summary: 'Update a transporter' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransporterDto,
    @CurrentUser('id') actorId: string,
  ): Promise<TransporterItem> {
    return this.commandBus.execute(new UpdateTransporterCommand(id, dto, actorId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.TRANSPORTER_DELETE)
  @ApiOperation({ summary: 'Soft-delete a transporter (blocked while vehicles/drivers exist)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: boolean }> {
    await this.commandBus.execute(new DeleteTransporterCommand(id, actorId));
    return { success: true };
  }
}

@ApiTags('Vehicles')
@ApiBearerAuth()
@Controller('vehicles')
export class VehiclesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VEHICLE_READ)
  @ApiOperation({ summary: 'List vehicles (optionally filtered by transporter)' })
  list(@Query() query: LogisticsListQueryDto): Promise<Paginated<VehicleItem>> {
    return this.queryBus.execute(
      new ListVehiclesQuery(query, { transporterId: query.transporterId }),
    );
  }

  @Post()
  @RequirePermissions(PERMISSIONS.VEHICLE_CREATE)
  @ApiOperation({ summary: 'Register a vehicle' })
  create(@Body() dto: CreateVehicleDto, @CurrentUser('id') actorId: string): Promise<VehicleItem> {
    return this.commandBus.execute(new CreateVehicleCommand(dto, actorId));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.VEHICLE_UPDATE)
  @ApiOperation({ summary: 'Update a vehicle' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleDto,
    @CurrentUser('id') actorId: string,
  ): Promise<VehicleItem> {
    return this.commandBus.execute(new UpdateVehicleCommand(id, dto, actorId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.VEHICLE_DELETE)
  @ApiOperation({ summary: 'Soft-delete a vehicle' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: boolean }> {
    await this.commandBus.execute(new DeleteVehicleCommand(id, actorId));
    return { success: true };
  }
}

@ApiTags('Drivers')
@ApiBearerAuth()
@Controller('drivers')
export class DriversController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DRIVER_READ)
  @ApiOperation({ summary: 'List drivers (optionally filtered by transporter)' })
  list(@Query() query: LogisticsListQueryDto): Promise<Paginated<DriverItem>> {
    return this.queryBus.execute(
      new ListDriversQuery(query, { transporterId: query.transporterId }),
    );
  }

  @Get('next-code')
  @RequirePermissions(PERMISSIONS.DRIVER_READ)
  @ApiOperation({ summary: 'Suggest the next driver code' })
  nextCode(): Promise<string> {
    return this.queryBus.execute(new NextDriverCodeQuery());
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DRIVER_CREATE)
  @ApiOperation({ summary: 'Create a driver' })
  create(@Body() dto: CreateDriverDto, @CurrentUser('id') actorId: string): Promise<DriverItem> {
    return this.commandBus.execute(new CreateDriverCommand(dto, actorId));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.DRIVER_UPDATE)
  @ApiOperation({ summary: 'Update a driver' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDriverDto,
    @CurrentUser('id') actorId: string,
  ): Promise<DriverItem> {
    return this.commandBus.execute(new UpdateDriverCommand(id, dto, actorId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.DRIVER_DELETE)
  @ApiOperation({ summary: 'Soft-delete a driver' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: boolean }> {
    await this.commandBus.execute(new DeleteDriverCommand(id, actorId));
    return { success: true };
  }
}
