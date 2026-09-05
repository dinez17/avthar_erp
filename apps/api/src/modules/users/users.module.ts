import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '../auth/auth.module';
import { USERS_REPOSITORY } from './domain/users.repository';
import { PrismaUsersRepository } from './infrastructure/prisma-users.repository';
import { UsersController } from './presentation/users.controller';
import { CreateUserHandler } from './application/commands/create-user.handler';
import { UpdateUserHandler } from './application/commands/update-user.handler';
import { DeleteUserHandler } from './application/commands/delete-user.handler';
import { ListSalesmenHandler, ListUsersHandler } from './application/queries/list-users.handler';
import { GetUserHandler } from './application/queries/get-user.handler';

/** User management: CRUD with role/branch/department assignment. */
@Module({
  imports: [CqrsModule, AuthModule],
  controllers: [UsersController],
  providers: [
    { provide: USERS_REPOSITORY, useClass: PrismaUsersRepository },
    CreateUserHandler,
    UpdateUserHandler,
    DeleteUserHandler,
    ListUsersHandler,
    ListSalesmenHandler,
    GetUserHandler,
  ],
})
export class UsersModule {}
