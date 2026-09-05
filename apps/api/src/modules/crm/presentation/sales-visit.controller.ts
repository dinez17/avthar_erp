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
import type { Paginated, SalesVisitItem } from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import {
  CreateSalesVisitCommand,
  DeleteSalesVisitCommand,
  ListSalesVisitsQuery,
  UpdateSalesVisitCommand,
} from '../application/sales-visit.handlers';
import {
  CreateSalesVisitDto,
  SalesVisitListQueryDto,
  UpdateSalesVisitDto,
} from './dto/sales-visit.dto';

@ApiTags('CRM Sales visits')
@ApiBearerAuth()
@Controller('visits')
export class SalesVisitController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CRM_VISIT_READ)
  @ApiOperation({ summary: 'List visits; filter by lead, salesperson, status or overdue' })
  list(@Query() query: SalesVisitListQueryDto): Promise<Paginated<SalesVisitItem>> {
    return this.queryBus.execute(
      new ListSalesVisitsQuery(query, {
        leadId: query.leadId,
        salespersonUserId: query.salespersonUserId,
        status: query.status,
        overdue: query.overdue,
      }),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.CRM_VISIT_CREATE)
  @ApiOperation({ summary: 'Schedule or log a visit against a lead' })
  create(
    @Body() dto: CreateSalesVisitDto,
    @CurrentUser('id') actorId: string,
  ): Promise<SalesVisitItem> {
    return this.commandBus.execute(new CreateSalesVisitCommand(dto, actorId));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CRM_VISIT_UPDATE)
  @ApiOperation({ summary: 'Update a visit; completing it can move the lead' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSalesVisitDto,
    @CurrentUser('id') actorId: string,
  ): Promise<SalesVisitItem> {
    return this.commandBus.execute(new UpdateSalesVisitCommand(id, dto, actorId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.CRM_VISIT_DELETE)
  @ApiOperation({ summary: 'Soft-delete a visit' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: boolean }> {
    await this.commandBus.execute(new DeleteSalesVisitCommand(id, actorId));
    return { success: true };
  }
}
