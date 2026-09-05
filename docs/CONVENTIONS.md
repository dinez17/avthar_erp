# Conventions

- **Language**: TypeScript everywhere, `strict` mode, no `any`.
- **Commits**: Conventional Commits, enforced by commitlint on `commit-msg`.
- **Formatting**: Prettier; **linting**: ESLint (flat config). Both run on staged files via
  Husky + lint-staged.
- **Naming**: files `kebab-case`; classes/types `PascalCase`; variables/functions `camelCase`;
  constants `SCREAMING_SNAKE_CASE`.
- **Imports**: use `import type` for type-only imports (auto-fixed by ESLint).
- **API responses**: always the standard envelope built by `@tiles-erp/shared`.
- **Database writes**: never mutate stock directly — model stock as movements (enforced when
  the inventory module is built).
- **Do not** put business logic in controllers; use CQRS handlers in the application layer.
