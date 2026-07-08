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
- `users` — учетные записи без доменной логики задач;
- `roles` — закрытый список ролей RBAC;
- `auth` — JWT authentication и guards foundation;
- `work-shifts` — первый бизнес-домен рабочей смены;
- global exception filter — единый foundation для ошибок.

На текущем этапе здесь нет tasks, photos, coins или AI. Модуль `events` сохраняет события утвержденных типов. Модуль `processes` хранит только текущее состояние процесса; историю изменений хранит Event Engine. Модуль `auth` реализует только фундамент входа, JWT и RBAC. Модуль `work-shifts` фиксирует начало и завершение смены текущего пользователя.
