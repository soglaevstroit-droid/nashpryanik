# scripts

Назначение: будущие вспомогательные инженерные сценарии проекта.

Источник истины:

- `DEVELOPMENT_RULES.md`
- `TECH_STACK_DECISION.md`
- `INFRASTRUCTURE_MASTER_PLAN.md`

## Локальная разработка

Полная локальная среда запускается из корня проекта:

```bash
npm run dev
```

`dev.mjs` использует `.env`, если он существует, либо безопасные локальные значения из
`.env.example`, не создавая новый файл. Скрипт запускает и проверяет PostgreSQL, Redis и
MinIO, применяет существующие Prisma migrations, создает локального demo worker и
запускает backend с demo frontend. Для остановки нажмите `Ctrl+C`.

Также локальные backend и demo frontend можно остановить из другого терминала:

```bash
npm run stop
```

PID запущенных процессов хранится в `.runtime/dev-processes.json`. Команда проверяет PID,
группу процессов, команду и рабочий каталог проекта, отправляет `SIGTERM`, а после таймаута —
`SIGKILL` только оставшимся подтверждённым процессам. PostgreSQL, Redis и MinIO продолжают
работать после `npm run stop` и `Ctrl+C`.

`prisma.mjs` запускает установленный в npm workspace Prisma CLI без жесткой привязки к
расположению `node_modules`.

## Резервное копирование production

Подготовительная команда `npm run backup` проверяет локальные prerequisites, создаёт будущую
структуру хранения и выводит план без подключения к production и без запуска `pg_dump`.
Подробный процесс описан в [`docs/PRODUCTION_BACKUP.md`](../docs/PRODUCTION_BACKUP.md).

`npm run backup:check` выполняет разрешённую read-only диагностику готовности production.
JSON-результат доступен через `npm run backup:check -- --json`. Команда не создаёт backup и
не запускает `pg_dump`.
