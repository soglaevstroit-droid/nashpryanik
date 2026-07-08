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
- `GET /health`;
- минимальный тест health controller.

## Команды

```bash
npm run backend:dev
npm run backend:build
npm run backend:lint
npm run backend:test
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

## Ограничения

На текущем этапе не реализованы бизнес-модули, доменные сущности, Prisma, PostgreSQL-подключение, auth, users, tasks, events, photos, coins или AI.
