import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { UUID } from '@tiles-erp/shared-types';
import type { AuthUser } from '../domain/user.entity';
import type { UserRepository } from '../domain/user.repository';

const userInclude = {
  roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
  branches: true,
  departments: true,
} as const;

type UserWithRelations = {
  id: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
  roles: { roleId: string; role: { name: string; permissions: { permission: { code: string } }[] } }[];
  branches: { branchId: string }[];
  departments: { departmentId: string }[];
};

/** Prisma-backed implementation of the auth {@link UserRepository} port. */
@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toAuthUser(user: UserWithRelations): AuthUser {
    const permissions = new Set<string>();
    for (const ur of user.roles) {
      for (const rp of ur.role.permissions) permissions.add(rp.permission.code);
    }
    return {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      isActive: user.isActive,
      roleIds: user.roles.map((r) => r.roleId),
      roles: user.roles.map((r) => r.role.name),
      permissions: [...permissions],
      branchIds: user.branches.map((b) => b.branchId),
      departmentIds: user.departments.map((d) => d.departmentId),
    };
  }

  async findByEmail(email: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      include: userInclude,
    });
    return user ? this.toAuthUser(user as unknown as UserWithRelations) : null;
  }

  async updatePassword(id: UUID, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  async findById(id: UUID): Promise<AuthUser | null> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: userInclude,
    });
    return user ? this.toAuthUser(user as unknown as UserWithRelations) : null;
  }
}
