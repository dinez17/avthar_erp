import {
  Body,
  Controller,
  Delete,
  Get,
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
  GatePassItem,
  GatePassPrintData,
  Paginated,
  PendingDispatchInvoice,
} from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { RequireBranchScope } from '../../auth/decorators/scope.decorator';
import {
  CancelGatePassCommand,
  CloseTripCommand,
  CreateGatePassCommand,
  DeleteGatePassCommand,
  DeliverGatePassCommand,
  GateOutCommand,
  GatePassPrintQuery,
  GetGatePassQuery,
  ListGatePassesQuery,
  PendingDispatchQuery,
  ReturnGatePassCommand,
  SetGatePassLoadedCommand,
  UpdateGatePassCommand,
} from '../application/gate-pass.handlers';
import {
  CancelGatePassDto,
  CloseTripDto,
  CreateGatePassDto,
  DeliverGatePassDto,
  GateOutDto,
  GatePassListQueryDto,
  GatePassVersionDto,
  PendingDispatchQueryDto,
  SetLoadedDto,
  UpdateGatePassDto,
} from './dto/gate-pass.dto';

@ApiTags('Dispatch')
@ApiBearerAuth()
@Controller('gate-passes')
export class GatePassController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.GATE_PASS_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'List gate passes, newest first' })
  list(@Query() query: GatePassListQueryDto): Promise<Paginated<GatePassItem>> {
    return this.queryBus.execute(
      new ListGatePassesQuery(query, {
        branchId: query.branchId,
        customerId: query.customerId,
        type: query.type,
        status: query.status,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
      }),
    );
  }

  /** Registered before `:id` — a literal path under the same prefix must come first. */
  @Get('pending')
  @RequirePermissions(PERMISSIONS.GATE_PASS_CREATE)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'Posted invoices with goods still waiting to go out' })
  pending(@Query() query: PendingDispatchQueryDto): Promise<PendingDispatchInvoice[]> {
    return this.queryBus.execute(new PendingDispatchQuery(query.branchId, query.customerId));
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.GATE_PASS_READ)
  @ApiOperation({ summary: 'One gate pass with its documents and loaded lines' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<GatePassItem> {
    return this.queryBus.execute(new GetGatePassQuery(id));
  }

  @Get(':id/print')
  @RequirePermissions(PERMISSIONS.GATE_PASS_READ)
  @ApiOperation({ summary: 'The gate pass with the letterhead a printed copy needs' })
  print(@Param('id', ParseUUIDPipe) id: string): Promise<GatePassPrintData> {
    return this.queryBus.execute(new GatePassPrintQuery(id));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.GATE_PASS_CREATE)
  @RequireBranchScope({ in: 'body' })
  @ApiOperation({ summary: 'Start a gate pass by loading documents onto a vehicle' })
  create(@Body() body: CreateGatePassDto, @CurrentUser('id') userId: string): Promise<GatePassItem> {
    return this.commandBus.execute(new CreateGatePassCommand(body, userId));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.GATE_PASS_UPDATE)
  @ApiOperation({ summary: 'Edit a draft gate pass' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateGatePassDto,
    @CurrentUser('id') userId: string,
  ): Promise<GatePassItem> {
    return this.commandBus.execute(new UpdateGatePassCommand(id, body, userId));
  }

  @Patch(':id/loaded')
  @RequirePermissions(PERMISSIONS.GATE_PASS_LOAD)
  @ApiOperation({ summary: 'Confirm the load is checked, or send it back to draft' })
  setLoaded(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetLoadedDto,
    @CurrentUser('id') userId: string,
  ): Promise<GatePassItem> {
    return this.commandBus.execute(
      new SetGatePassLoadedCommand(id, body.version, body.loaded ?? true, userId),
    );
  }

  @Patch(':id/gate-out')
  @RequirePermissions(PERMISSIONS.GATE_PASS_GATE_OUT)
  @ApiOperation({ summary: 'Let the vehicle out, noting the odometer' })
  gateOut(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: GateOutDto,
    @CurrentUser('id') userId: string,
  ): Promise<GatePassItem> {
    return this.commandBus.execute(
      new GateOutCommand(id, body.version, body.startKm ?? null, userId),
    );
  }

  @Patch(':id/close')
  @RequirePermissions(PERMISSIONS.GATE_PASS_CLOSE)
  @ApiOperation({
    summary: 'Close the trip: closing odometer, what each drop settled, cash counted in',
  })
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CloseTripDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('email') email: string,
  ): Promise<GatePassItem> {
    return this.commandBus.execute(new CloseTripCommand(id, body, userId, email));
  }

  @Patch(':id/deliver')
  @RequirePermissions(PERMISSIONS.GATE_PASS_DELIVER)
  @ApiOperation({ summary: 'Record proof of delivery' })
  deliver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DeliverGatePassDto,
    @CurrentUser('id') userId: string,
  ): Promise<GatePassItem> {
    return this.commandBus.execute(new DeliverGatePassCommand(id, body, userId));
  }

  @Patch(':id/return')
  @RequirePermissions(PERMISSIONS.GATE_PASS_DELIVER)
  @ApiOperation({ summary: 'Record a returnable sample coming back into stock' })
  recordReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: GatePassVersionDto,
    @CurrentUser('id') userId: string,
  ): Promise<GatePassItem> {
    return this.commandBus.execute(new ReturnGatePassCommand(id, body.version, userId));
  }

  @Patch(':id/cancel')
  @RequirePermissions(PERMISSIONS.GATE_PASS_CANCEL)
  @ApiOperation({ summary: 'Cancel a gate pass, putting back anything it had taken out' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CancelGatePassDto,
    @CurrentUser('id') userId: string,
  ): Promise<GatePassItem> {
    return this.commandBus.execute(
      new CancelGatePassCommand(id, body.version, body.reason, userId),
    );
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.GATE_PASS_DELETE)
  @ApiOperation({ summary: 'Delete a draft gate pass' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ success: true }> {
    return this.commandBus.execute(new DeleteGatePassCommand(id, userId));
  }
}
