import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './presentation/auth.controller';
import { LoginHandler } from './application/commands/login.handler';
import { RefreshTokenHandler } from './application/commands/refresh-token.handler';
import { LogoutHandler } from './application/commands/logout.handler';
import { ChangePasswordHandler } from './application/commands/change-password.handler';
import { GetMeHandler } from './application/queries/get-me.handler';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './infrastructure/token.service';
import { PasswordService } from './infrastructure/password.service';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { USER_REPOSITORY } from './domain/user.repository';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { RolesGuard } from './guards/roles.guard';
import { BranchGuard } from './guards/branch.guard';
import { DepartmentGuard } from './guards/department.guard';

const commandHandlers = [LoginHandler, RefreshTokenHandler, LogoutHandler, ChangePasswordHandler];
const queryHandlers = [GetMeHandler];

/**
 * Authentication foundation. Provides JWT/refresh token issuance and rotation, the
 * passport strategy, and the full guard set (auth, permission, role, branch, department)
 * that feature modules will compose. No login UI is included at this stage.
 */
@Module({
  imports: [CqrsModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    TokenService,
    PasswordService,
    JwtStrategy,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    ...commandHandlers,
    ...queryHandlers,
    JwtAuthGuard,
    PermissionsGuard,
    RolesGuard,
    BranchGuard,
    DepartmentGuard,
  ],
  exports: [
    TokenService,
    PasswordService,
    JwtAuthGuard,
    PermissionsGuard,
    RolesGuard,
    BranchGuard,
    DepartmentGuard,
  ],
})
export class AuthModule {}
