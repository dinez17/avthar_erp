-- The original-copy operator and godown staff have separate one-time print rights.
INSERT INTO roles (
  id, name, description, "isSystem", "isSalesRole", "createdAt", "updatedAt", version
)
VALUES (
  gen_random_uuid(),
  'DELIVERY SLIP PRINT',
  'Can view and print one complete original delivery slip per invoice',
  false,
  false,
  now(),
  now(),
  1
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  "updatedAt" = now(),
  version = roles.version + 1;

INSERT INTO role_permissions ("roleId", "permissionId")
SELECT role.id, permission.id
FROM roles role
CROSS JOIN permissions permission
WHERE role.name IN ('DELIVERY SLIP PRINT', 'GODOWN STAFF')
  AND permission.code = 'deliverySlip:print'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
