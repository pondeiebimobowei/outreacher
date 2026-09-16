# Monorepo Packages

This directory contains shared packages and configurations for the Career Outreach Platform.

## Packages Overview

- `domain` (`@repo/domain`): Core domain boundaries, pure business concepts, and domain entity rules.
- `shared` (`@repo/shared`): Shared cross-boundary contracts, DTO types, and utilities.
- `config-typescript` (`@repo/typescript-config`): Shared TypeScript compiler configurations.
- `config-eslint` (`@repo/eslint-config`): Shared ESLint rule configurations.
- `jest-presets` (`@repo/jest-presets`): Shared Jest test configurations.
- `logger` (`@repo/logger`): Shared application logging module.
- `ui` (`@repo/ui`): Shared React UI component library.

## Architectural Layering Rules (from AGENT.md §7-10)

1. Domain logic (`@repo/domain`) MUST remain independent of NestJS, Prisma, React, HTTP frameworks, and external SDKs.
2. Frontend (`apps/web`) and Backend (`apps/api`) remain independently buildable and executable applications.
3. Avoid premature shared abstractions.
