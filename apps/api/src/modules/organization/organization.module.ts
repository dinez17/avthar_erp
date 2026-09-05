import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import {
  BRANCH_REPOSITORY,
  COMPANY_REPOSITORY,
  GATE_REPOSITORY,
  GODOWN_REPOSITORY,
  RACK_REPOSITORY,
} from './domain/org-node.repository';
import {
  PrismaBranchRepository,
  PrismaCompanyRepository,
  PrismaGateRepository,
  PrismaGodownRepository,
  PrismaRackRepository,
} from './infrastructure/prisma-org.repositories';
import {
  BranchesController,
  CompaniesController,
  GatesController,
  GodownsController,
  RacksController,
} from './presentation/organization.controllers';
import * as handlers from './application/org-node.handlers';

/**
 * Company hierarchy management: Company -> Branch -> Godown -> Gate -> Rack.
 * All five levels share one uniform contract (OrgNodeItem); level-specific rules
 * (parent/code requirements, unique-code scope, child blocking) live in the
 * repositories and rule descriptors.
 */
@Module({
  imports: [CqrsModule],
  controllers: [
    CompaniesController,
    BranchesController,
    GodownsController,
    GatesController,
    RacksController,
  ],
  providers: [
    { provide: COMPANY_REPOSITORY, useClass: PrismaCompanyRepository },
    { provide: BRANCH_REPOSITORY, useClass: PrismaBranchRepository },
    { provide: GODOWN_REPOSITORY, useClass: PrismaGodownRepository },
    { provide: GATE_REPOSITORY, useClass: PrismaGateRepository },
    { provide: RACK_REPOSITORY, useClass: PrismaRackRepository },
    ...Object.values(handlers),
  ],
})
export class OrganizationModule {}
