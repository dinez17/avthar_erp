import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { buildPaginated } from '@tiles-erp/shared';
import type { AuditLogItem, Paginated, PaginationQuery } from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { AuditListFilter, AuditRepository } from '../domain/audit.repository';

@Injectable()
export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PaginationQuery, filter: AuditListFilter): Promise<Paginated<AuditLogItem>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(filter.entity ? { entity: filter.entity } : {}),
      ...(filter.userId ? { userId: filter.userId } : {}),
      ...(query.search ? { entityId: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const userIds = [...new Set(rows.map((r) => r.userId).filter((v): v is string => v !== null))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true },
        })
      : [];
    const emailById = new Map(users.map((u) => [u.id, u.email]));

    return buildPaginated(
      rows.map((r) => ({
        id: r.id,
        entity: r.entity,
        entityId: r.entityId,
        action: r.action,
        userId: r.userId,
        userEmail: r.userId ? (emailById.get(r.userId) ?? null) : null,
        changes: (r.changes as Record<string, unknown> | null) ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      query.page,
      query.pageSize,
      total,
    );
  }

  async listEntities(): Promise<string[]> {
    const rows = await this.prisma.auditLog.findMany({
      distinct: ['entity'],
      select: { entity: true },
      orderBy: { entity: 'asc' },
    });
    return rows.map((r) => r.entity);
  }
}
