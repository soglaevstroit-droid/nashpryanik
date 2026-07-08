# apps/backend/src

NestJS backend foundation.

Создана только платформенная основа:

- `config` — чтение базовых переменных окружения;
- `logger` — базовый NestJS logger;
- `common` — общая инфраструктурная зона;
- `database` — Prisma/PostgreSQL foundation без доменных моделей;
- `health` — endpoint `GET /health`;
- `health/ready` — readiness endpoint с проверкой подключения к базе;
- `events` — технический фундамент Event Engine для памяти компании;
- `processes` — технический фундамент Process Engine для текущего состояния процесса;
- global exception filter — единый foundation для ошибок.

На текущем этапе здесь нет бизнес-модулей, auth, users, tasks, photos, coins или AI. Модуль `events` сохраняет события утвержденных типов. Модуль `processes` хранит только текущее состояние процесса; историю изменений хранит Event Engine.
