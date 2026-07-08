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
- Event Engine foundation;
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

## Event Foundation API

Технические endpoints Event Engine доступны без auth только для проверки фундамента памяти компании:

```http
POST /api/v1/events
GET /api/v1/events
GET /api/v1/events/:id
```

Пример создания события:

```json
{
  "type": "SYSTEM_UPDATED",
  "actorId": null,
  "entityType": "platform",
  "entityId": "backend",
  "payload": {
    "source": "event-foundation"
  },
  "metadata": {
    "environment": "development"
  }
}
```

`type` принимает только значения из `09_Event_Bible/001_EVENT_TYPES.md`. Произвольные event types запрещены.

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

Initial database migration создана без доменных таблиц. Event foundation migration создает только таблицу `events` и enum `EventType` для памяти компании. Она не создает `users`, `tasks`, `photos`, `coins` или другие бизнес-сущности.

Prisma CLI использует корневой `.env`. Перед запуском `npm run prisma:generate`, `npm run prisma:migrate` или `npm run prisma:studio` из корня проекта должен существовать локальный `.env`, созданный из `.env.example`.

## Ограничения

На текущем этапе не реализованы бизнес-модули, auth, users, tasks, photos, coins или AI. Event module является только техническим фундаментом памяти компании.
