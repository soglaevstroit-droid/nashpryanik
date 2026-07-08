# apps/backend/src

NestJS backend foundation.

Создана только платформенная основа:

- `config` — чтение базовых переменных окружения;
- `logger` — базовый NestJS logger;
- `common` — общая инфраструктурная зона;
- `health` — endpoint `GET /health`;
- global exception filter — единый foundation для ошибок.

На текущем этапе здесь нет бизнес-модулей, доменных сущностей, Prisma, PostgreSQL-подключения, auth, users, tasks, events, photos, coins или AI.
