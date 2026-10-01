-- The foundation seed grants every known permission to broad administrative roles.
-- Delivery-slip issuance is intentionally narrower: assignment must be explicit through
-- the dedicated role (SUPER_ADMIN remains an application-level emergency bypass).
DELETE FROM role_permissions role_permission
USING roles role, permissions permission
WHERE role_permission."roleId" = role.id
  AND role_permission."permissionId" = permission.id
  AND permission.code = 'deliverySlip:print'
  AND role.name <> 'DELIVERY SLIP PRINT';
