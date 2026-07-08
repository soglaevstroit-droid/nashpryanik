# apps/backend

Назначение: backend foundation СТРОИТ.РФ.

Источник истины:

- `TECH_STACK_DECISION.md`
- `DEVELOPMENT_RULES.md`
- `INFRASTRUCTURE_MASTER_PLAN.md`
- `ENGINEERING_START_AUDIT.md`
- `04_API`
- `05_Backend`

Утвержденный стек для инженерного старта: NestJS, TypeScript, Prisma ORM, PostgreSQL, JWT, RBAC, Redis, BullMQ и REST API `/api/v1`.

## Что реализовано

- NestJS bootstrap;
- config foundation;
- logger foundation;
- global error foundation;
- Prisma/PostgreSQL database foundation;
- `GET /health`;
- `GET /health/ready`;
- минимальный тест health controller.

## Команды

```bash
npm run backend:dev
npm run backend:build
npm run backend:lint
npm run backend:test
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
npm run backend:db:check
```

## Health endpoint

```http
GET /health
```

Ответ:

```json
{
  "status": "ok",
  "appName": "СТРОИТ.РФ",
  "environment": "development",
  "timestamp": "2026-07-08T00:00:00.000Z"
}
```

## Readiness endpoint

```http
GET /health/ready
```

Ответ:

```json
{
  "status": "ok",
  "appName": "СТРОИТ.РФ",
  "environment": "development",
  "timestamp": "2026-07-08T00:00:00.000Z",
  "database": {
    "connected": true
  }
}
```

## Prisma

Prisma schema находится в `apps/backend/prisma/schema.prisma`.

Initial migration создана без доменных таблиц. Она фиксирует migration foundation, но не создает `users`, `tasks`, `photos`, `coins`, `events` или другие бизнес-сущности.

Prisma CLI использует корневой `.env`. Перед запуском `npm run prisma:generate`, `npm run prisma:migrate` или `npm run prisma:studio` из корня проекта должен существовать локальный `.env`, созданный из `.env.example`.

## Ограничения

На текущем этапе не реализованы бизнес-модули, доменные сущности, auth, users, tasks, events, photos, coins или AI.
