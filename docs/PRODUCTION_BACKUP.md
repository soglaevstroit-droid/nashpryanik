# Production database backup

`npm run backup` и `npm run backup:create` запускают один gated-сценарий production-backup.
Без `--approved` команда всегда отказывает. Флаг применяется только на этапе 2 после точного
утверждения пользователя по AGENTS.md и сам по себе не даёт разрешения на production.

## Подготовка

Создайте игнорируемый Git файл `.env` из `.env.example` и задайте:

- `BACKUP_SSH_HOST`, `BACKUP_SSH_PORT`, `BACKUP_SSH_USER` — SSH endpoint;
- `BACKUP_DATABASE_HOST`, `BACKUP_DATABASE_PORT` — PostgreSQL со стороны сервера;
- `BACKUP_DATABASE_NAME`, `BACKUP_DATABASE_USER` — база и read-only backup role;
- `BACKUP_DIRECTORY` — относительный локальный каталог (рекомендуется `backup`).

Секреты нельзя коммитить или передавать аргументами командной строки. Пароль будущей отдельной
backup role должен передаваться `pg_dump` через защищённый серверный `.pgpass`/`PGPASSFILE`.

## Использование

```bash
npm run backup
npm run backup:create -- --approved
```

До утверждения используйте `backup:check`, `backup:restore-check` и `publish -- --dry-run`.
Настоящий backup запрещён на этапе 1. После утверждения сценарий требует успешные readiness и
restore-check, использует серверный `pg_dump`, lock и `.partial`, проверяет gzip/SHA-256,
скачивает копию на Mac и восстанавливает именно новый архив во временную базу.

## Read-only проверка production

```bash
npm run backup:check
npm run backup:check -- --json
```

Проверка использует SSH alias `stroit-server` из конфигурации Mac, а при его отсутствии —
`root@176.125.242.120`. Подключение разрешено только по ключу (`BatchMode=yes`) и только к уже
подтверждённому host key (`StrictHostKeyChecking=yes`). Пароли, токены, `.env` и `DATABASE_URL`
не читаются и не выводятся.

Скрипт проверяет Docker daemon, состояние и health контейнера `stroit-postgres`, наличие
`pg_dump` и `psql`, доступность `stroit_dev` и роли `stroit`, `SELECT 1`, размер БД, таблицы,
пользователей, задачи и миграции. Также проверяются `/root/backups/postgres`, свободное место,
`/root/backup-postgres.sh`, cron и метаданные последнего backup. На Mac проверяются свободное
место, `ssh` и необязательный локальный `pg_dump`.

На сервер передаётся фиксированный shell-сценарий только с командами чтения: `command -v`,
`docker info`, `docker inspect`, `docker exec … command -v`, `pg_isready`, `psql` только с
`SELECT`, `test`, `df`, `crontab -l`, `find`, `stat`-эквивалентные метаданные, `sort`, `head`,
`cut` и `awk`. Команды `pg_dump`, `pg_restore` и любые операции записи не выполняются. Проверка
не создаёт backup и не изменяет файлы, БД, контейнеры или системную конфигурацию.

`CRITICAL` означает, что backup-инфраструктура не готова; команда завершится с кодом 1.
`WARNING` требует внимания, но не меняет готовность. `INFO` содержит безопасные метрики.
Пороги свободного места: warning ниже 5 GiB, critical ниже 2 GiB. Backup старше 24 часов и
файл меньше 1 MiB дают warning; нулевой файл — critical. Малый файл может быть нормален для
почти пустой базы, поэтому сам по себе не блокирует готовность.

При ошибке проверьте SSH alias/key/known_hosts, Docker и контейнер, права каталога, cron и
последний файл. Исправления на production выполняются только отдельной утверждённой задачей.

## Структура хранения

```text
backup/
  <database>/
    YYYY/
      MM/
        DD/
          stroit_dev_YYYYMMDDTHHMMSSZ.sql.gz
```

Формат `.sql.gz` сохранён для совместимости с существующим серверным процессом. Целостность
проверяется `gzip -t`, восстановление выполняется через `psql` только во временную базу.
Каталог `backup/` исключён из Git. Переход на custom dump требует отдельного решения и проверки
совместимости.

## Будущее восстановление

1. Выбрать `.sql.gz` и проверить его через `gzip -t <file>`.
2. Сверить версии `pg_dump`/`pg_restore` и целевого PostgreSQL.
3. Создать отдельную пустую БД восстановления; не восстанавливать сразу поверх production.
4. Передать `gzip -cd <file>` в `psql --set ON_ERROR_STOP=1 --dbname=<temporary-target>`.
5. Проверить схему, количество критичных записей и приложение на изолированной БД.
6. Переключение production выполнять только по отдельному утверждённому runbook.

## Условия включения реального backup

Потребуются отдельное утверждение, ограниченная SSH/DB role, безопасная аутентификация,
проверка host key, блокировка параллельных запусков, атомарная запись временного файла,
checksum, шифрование, retention, off-site копирование и регулярный тест восстановления.

## Полный безопасный цикл

`backup:restore-check` описан в [`RESTORE_CHECK.md`](./RESTORE_CHECK.md). После отдельного
утверждения `backup:create -- --approved` сохраняет совместимый `.sql.gz`: сначала `.partial`,
затем `gzip -t`, SHA-256 и атомарное переименование. Архив и `.sha256` скачиваются в
`backup/stroit_dev/YYYY/MM/DD/`, повторно сверяются и проходят изолированный restore-check.

Lock `/root/backups/postgres/.backup.lock` запрещает параллельный запуск. Активный или stale
lock автоматически не удаляется. Неуспешный `.partial` не считается backup. Если проверка
нового архива не прошла, он сохраняется для расследования и deploy блокируется.

Retention пока только предлагается: 14 ежедневных, 8 еженедельных и 12 ежемесячных копий.
Автоматического удаления нет. Процесс публикации и rollback описан в
[`PUBLISH_WORKFLOW.md`](./PUBLISH_WORKFLOW.md) и [`ROLLBACK.md`](./ROLLBACK.md).

Checksum имеет вид `SHA256  <hex>  <filename>`. Проверка на Mac выполняется автоматически;
вручную сравните `shasum -a 256 <backup>` со значением в соседнем `.sha256`.
