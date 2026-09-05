import { SetMetadata } from '@nestjs/common';

export const BRANCH_SCOPE_KEY = 'auth:branchScope';
export const DEPARTMENT_SCOPE_KEY = 'auth:departmentScope';

export interface ScopeSource {
  /** Where to read the id from and under which key. Defaults to params.branchId / params.departmentId. */
  in?: 'params' | 'query' | 'body';
  key?: string;
}

/** Enforces that the request targets a branch the user is assigned to. */
export const RequireBranchScope = (source: ScopeSource = {}): MethodDecorator =>
  SetMetadata(BRANCH_SCOPE_KEY, { in: source.in ?? 'params', key: source.key ?? 'branchId' });

/** Enforces that the request targets a department the user is assigned to. */
export const RequireDepartmentScope = (source: ScopeSource = {}): MethodDecorator =>
  SetMetadata(DEPARTMENT_SCOPE_KEY, {
    in: source.in ?? 'params',
    key: source.key ?? 'departmentId',
  });
