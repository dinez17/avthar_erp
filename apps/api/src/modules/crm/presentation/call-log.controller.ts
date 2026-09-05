import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@tiles-erp/config';
import type { CallLogItem, Paginated } from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import {
  CreateCallLogCommand,
  DeleteCallLogCommand,
  ListCallLogsQuery,
} from '../application/call-log.handlers';
import { CallLogListQueryDto, CreateCallLogDto } from './dto/call-log.dto';

@ApiTags('CRM Telecalling')
@ApiBearerAuth()
@Controller('calls')
export class CallLogController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CRM_CALL_READ)
  @ApiOperation({ summary: 'List calls, newest first; filter by lead, caller, disposition or due' })
  list(@Query() query: CallLogListQueryDto): Promise<Paginated<CallLogItem>> {
    return this.queryBus.execute(
      new ListCallLogsQuery(query, {
        leadId: query.leadId,
        callerUserId: query.callerUserId,
        disposition: query.disposition,
        callbackDue: query.callbackDue,
      }),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.CRM_CALL_CREATE)
  @ApiOperation({
    summary: 'Log a call against a lead; a callback or "not interested" updates the lead',
  })
  create(
    @Body() dto: CreateCallLogDto,
    @CurrentUser('id') actorId: string,
  ): Promise<CallLogItem> {
    return this.commandBus.execute(new CreateCallLogCommand(dto, actorId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.CRM_CALL_DELETE)
  @ApiOperation({ summary: 'Soft-delete a mislogged call' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: boolean }> {
    await this.commandBus.execute(new DeleteCallLogCommand(id, actorId));
    return { success: true };
  }
}
