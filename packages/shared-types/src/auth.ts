import type { UUID } from './common';

/** Claims embedded in the signed JWT access token. */
export interface JwtAccessPayload {
  sub: UUID;
  email: string;
  roleIds: UUID[];
  roles: string[];
  permissions: string[];
  branchIds: UUID[];
  departmentIds: UUID[];
  tokenType: 'access';
  iat?: number;
  exp?: number;
}

/** Claims embedded in the signed JWT refresh token. */
export interface JwtRefreshPayload {
  sub: UUID;
  /** Rotating token family identifier used to detect refresh-token reuse. */
  tokenId: UUID;
  tokenType: 'refresh';
  iat?: number;
  exp?: number;
}

/** Token pair issued on successful authentication. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

/** The authenticated principal attached to each request. */
export interface AuthenticatedUser {
  id: UUID;
  email: string;
  roleIds: UUID[];
  roles: string[];
  permissions: string[];
  branchIds: UUID[];
  departmentIds: UUID[];
}
