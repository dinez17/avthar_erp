-- This role uses a restricted posted-document list and cannot access invoice accounting pages.
INSERT INTO permissions (id, code, description, "createdAt")
VALUES (
  gen_random_uuid(),
  'deliverySlip:print',
  'View delivery details and print the one permitted delivery-slip copy',
  now()
)
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO roles (
  id, name, description, "isSystem", "isSalesRole", "createdAt", "updatedAt", version
)
VALUES (
  gen_random_uuid(),
  'DELIVERY SLIP PRINT',
  'Can only view and print the one permitted delivery-slip copy',
  false,
  false,
  now(),
  now(),
  1
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions ("roleId", "permissionId")
SELECT role.id, permission.id
FROM roles role
CROSS JOIN permissions permission
WHERE role.name = 'DELIVERY SLIP PRINT'
  AND permission.code = 'deliverySlip:print'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
