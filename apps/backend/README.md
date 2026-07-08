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
- Process Engine foundation;
- Authentication foundation;
- RBAC foundation;
- Work Shift foundation;
- Task foundation;
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

## Auth Foundation API

Authentication endpoints:

```http
POST /api/v1/auth/register
POST /api/v1/auth/login
GET /api/v1/auth/me
```

`register` и `login` возвращают JWT access token и публичные данные пользователя без `passwordHash`.

Минимальные роли RBAC:

- `CREATOR`
- `DIRECTOR`
- `FINANCE`
- `FOREMAN`
- `WORKER`
- `PARTNER`

Пароль хранится только как PBKDF2 hash с солью. Refresh tokens, logout и password reset не реализованы в этой миссии, чтобы не усложнять MVP foundation.

Значимые auth/user действия создают события:

- `USER_CREATED` при регистрации;
- `USER_LOGGED_IN` при успешном входе.

## Event Foundation API

Технические endpoints Event Engine защищены JWT и RBAC:

```http
POST /api/v1/events
GET /api/v1/events
GET /api/v1/events/:id
```

Доступ:

- `CREATOR`, `DIRECTOR`, `FOREMAN` — чтение и создание событий;
- `FINANCE` — чтение событий;
- `WORKER`, `PARTNER` — доступ к technical endpoints запрещен.

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

## Process Foundation API

Технические endpoints Process Engine защищены JWT и RBAC:

```http
POST /api/v1/processes
GET /api/v1/processes
GET /api/v1/processes/:id
PATCH /api/v1/processes/:id/start
PATCH /api/v1/processes/:id/pause
PATCH /api/v1/processes/:id/complete
PATCH /api/v1/processes/:id/cancel
```

Доступ:

- `CREATOR`, `DIRECTOR`, `FOREMAN` — чтение и изменение технических процессов;
- `FINANCE`, `WORKER`, `PARTNER` — доступ к technical process endpoints запрещен.

Пример создания процесса:

```json
{
  "type": "WORK_DAY",
  "title": "Рабочий день",
  "description": "Технический процесс для проверки Process Engine foundation"
}
```

`Process` хранит только текущее состояние жизненного цикла. История процесса не хранится в `processes`; каждое изменение состояния создает запись в Event Engine с явным `PROCESS_*` event type, `entityType: "process"` и `entityId` процесса.

## Work Shift Foundation API

Work Shift endpoints защищены JWT и работают для текущего авторизованного пользователя:

```http
POST /api/v1/work-shifts/start
POST /api/v1/work-shifts/finish
GET /api/v1/work-shifts/current
GET /api/v1/work-shifts/history
```

Правила foundation:

- у пользователя может быть только одна активная смена;
- начало смены создает `WorkShift` со статусом `ACTIVE`;
- начало смены создает и запускает Process `WORK_SHIFT`;
- завершение смены переводит `WorkShift` в `FINISHED`;
- завершение смены завершает связанный Process;
- начало и завершение смены создают события `WORK_SHIFT_STARTED` и `WORK_SHIFT_FINISHED`;
- задачи, фото, геолокация, таймеры, начисления, монеты и AI здесь не реализованы.

## Task Foundation API

Task endpoints защищены JWT и RBAC:

```http
POST /api/v1/tasks
GET /api/v1/tasks
GET /api/v1/tasks/:id
PATCH /api/v1/tasks/:id/assign
PATCH /api/v1/tasks/:id/accept
PATCH /api/v1/tasks/:id/start
PATCH /api/v1/tasks/:id/review
PATCH /api/v1/tasks/:id/complete
PATCH /api/v1/tasks/:id/cancel
```

Доступ:

- `CREATOR`, `DIRECTOR`, `FOREMAN` — создание, назначение, управление жизненным циклом и чтение;
- `WORKER` — принятие, старт, отправка на ревью, завершение назначенной задачи и чтение карточки задачи;
- `FINANCE` — только чтение списка и карточки задачи;
- `PARTNER` — доступа к task endpoints нет.

Минимальные статусы задачи:

- `CREATED`
- `ASSIGNED`
- `ACCEPTED`
- `IN_PROGRESS`
- `ON_REVIEW`
- `COMPLETED`
- `CANCELLED`

Минимальные приоритеты:

- `LOW`
- `NORMAL`
- `HIGH`
- `CRITICAL`

Правила foundation:

- задача создается вместе с Process `TASK`;
- Task хранит только текущее состояние, исполнителя, автора, приоритет и ссылку на Process;
- Task не хранит историю изменений;
- каждое изменение задачи создает Event Engine запись с `entityType: "task"`;
- отправка на ревью создает событие `TASK_SENT_TO_REVIEW`;
- завершение задачи завершает связанный Process;
- отмена задачи отменяет связанный Process;
- этапы, фото, чек-листы, комментарии, монеты и AI здесь не реализованы.

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

Initial database migration создана без доменных таблиц. Event foundation migration создает таблицу `events` и enum `EventType` для памяти компании. Process foundation migration создает таблицу `processes` и enum `ProcessStatus` для текущего состояния процесса. Auth foundation migration создает `users` и enum `Role`. Work Shift foundation migration создает `work_shifts` и enum `WorkShiftStatus`. Task foundation migration создает `tasks`, `TaskStatus` и `TaskPriority`. Эти migrations не создают `photos`, `coins` или AI-сущности.

Prisma CLI использует корневой `.env`. Перед запуском `npm run prisma:generate`, `npm run prisma:migrate` или `npm run prisma:studio` из корня проекта должен существовать локальный `.env`, созданный из `.env.example`.

## Ограничения

На текущем этапе не реализованы photos, coins или AI. Event module является техническим фундаментом памяти компании. Process module является техническим фундаментом жизненного цикла процесса. Work Shift module является первым бизнес-доменом и хранит только факт активной или завершенной смены. Task module является первым foundation для управляемой работы и хранит только текущее состояние задачи.
