import { Controller, Get, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PERMISSIONS } from '@tiles-erp/config';
import type { AuditLogItem, Paginated } from '@tiles-erp/shared-types';
import { PaginationQueryDto } from '../../../core/http/dto/pagination-query.dto';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { ListAuditEntitiesQuery, ListAuditLogsQuery } from '../application/audit.handlers';

class AuditListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by entity, e.g. users' })
  @IsString()
  @IsOptional()
  entity?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by acting user' })
  @IsUUID('4')
  @IsOptional()
  userId?: string;
}

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  @ApiOperation({ summary: 'List audit trail entries (newest first)' })
  list(@Query() query: AuditListQueryDto): Promise<Paginated<AuditLogItem>> {
    return this.queryBus.execute(
      new ListAuditLogsQuery(query, { entity: query.entity, userId: query.userId }),
    );
  }

  @Get('entities')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  @ApiOperation({ summary: 'Distinct entities present in the audit trail' })
  entities(): Promise<string[]> {
    return this.queryBus.execute(new ListAuditEntitiesQuery());
  }
}
