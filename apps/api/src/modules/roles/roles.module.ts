import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ROLES_REPOSITORY } from './domain/roles.repository';
import { PrismaRolesRepository } from './infrastructure/prisma-roles.repository';
import { RolesController } from './presentation/roles.controller';
import { CreateRoleHandler } from './application/commands/create-role.handler';
import { UpdateRoleHandler } from './application/commands/update-role.handler';
import { DeleteRoleHandler } from './application/commands/delete-role.handler';
import { ListRolesHandler } from './application/queries/list-roles.handler';
import { ListPermissionsHandler } from './application/queries/list-permissions.handler';

/** Role management: CRUD, permission assignment, system-role protection. */
@Module({
  imports: [CqrsModule],
  controllers: [RolesController],
  providers: [
    { provide: ROLES_REPOSITORY, useClass: PrismaRolesRepository },
    CreateRoleHandler,
    UpdateRoleHandler,
    DeleteRoleHandler,
    ListRolesHandler,
    ListPermissionsHandler,
  ],
})
export class RolesModule {}
