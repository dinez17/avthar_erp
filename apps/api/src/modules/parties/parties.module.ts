import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CUSTOMER_REPOSITORY, SUPPLIER_REPOSITORY } from './domain/party.repository';
import {
  PrismaCustomerRepository,
  PrismaSupplierRepository,
} from './infrastructure/prisma-party.repositories';
import { CustomersController, SuppliersController } from './presentation/party.controllers';
import {
  CreateCustomerHandler,
  CreateSupplierHandler,
  DeleteCustomerHandler,
  DeleteSupplierHandler,
  GetCustomerHandler,
  GetSupplierHandler,
  ListCustomersHandler,
  ListSuppliersHandler,
  NextCustomerCodeHandler,
  NextSupplierCodeHandler,
  UpdateCustomerHandler,
  UpdateSupplierHandler,
} from './application/party.handlers';

const handlers = [
  ListCustomersHandler,
  GetCustomerHandler,
  NextCustomerCodeHandler,
  CreateCustomerHandler,
  UpdateCustomerHandler,
  DeleteCustomerHandler,
  ListSuppliersHandler,
  GetSupplierHandler,
  NextSupplierCodeHandler,
  CreateSupplierHandler,
  UpdateSupplierHandler,
  DeleteSupplierHandler,
];

/** Trading party masters: customers (credit terms) and suppliers (payment terms). */
@Module({
  imports: [CqrsModule],
  controllers: [CustomersController, SuppliersController],
  providers: [
    { provide: CUSTOMER_REPOSITORY, useClass: PrismaCustomerRepository },
    { provide: SUPPLIER_REPOSITORY, useClass: PrismaSupplierRepository },
    ...handlers,
  ],
})
export class PartiesModule {}
