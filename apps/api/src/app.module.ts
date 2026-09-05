import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { CoreModule } from './core/core.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { HealthModule } from './modules/health/health.module';
import { SettingsModule } from './modules/settings/settings.module';
import { AuditModule } from './modules/audit/audit.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { ProductsModule } from './modules/products/products.module';
import { PartiesModule } from './modules/parties/parties.module';
import { LogisticsModule } from './modules/logistics/logistics.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PurchaseModule } from './modules/purchase/purchase.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { SalesModule } from './modules/sales/sales.module';
import { CrmModule } from './modules/crm/crm.module';
import { PortalModule } from './modules/portal/portal.module';
import { DispatchModule } from './modules/dispatch/dispatch.module';
import { SixOrbitModule } from './modules/sixorbit/sixorbit.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './modules/auth/guards/permissions.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { BranchGuard } from './modules/auth/guards/branch.guard';
import { DepartmentGuard } from './modules/auth/guards/department.guard';
import { AllExceptionsFilter } from './core/http/filters/all-exceptions.filter';
import { LoggingInterceptor } from './core/http/interceptors/logging.interceptor';
import { ResponseInterceptor } from './core/http/interceptors/response.interceptor';
import { AuditInterceptor } from './core/http/interceptors/audit.interceptor';

/**
 * Application root. Wires the cross-cutting CoreModule, the authentication foundation and
 * the health module, and registers the global pipe, guards, interceptors and exception filter.
 * Business feature modules are registered here as they are implemented.
 */
@Module({
  imports: [CoreModule, AuthModule, UsersModule, RolesModule, DepartmentsModule, OrganizationModule, SettingsModule, AuditModule, CatalogModule, ProductsModule, PartiesModule, LogisticsModule, InventoryModule, PurchaseModule, SalesModule, CrmModule, PortalModule, AccountsModule, DispatchModule, SixOrbitModule, HealthModule],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: BranchGuard },
    { provide: APP_GUARD, useClass: DepartmentGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
