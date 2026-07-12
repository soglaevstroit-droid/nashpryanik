# Production database backup

`npm run backup` подготавливает локальную структуру хранения и печатает план будущего
резервного копирования PostgreSQL. На текущем этапе команда **не устанавливает SSH-соединение**,
не обращается к production и не запускает `pg_dump`.

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
npm run backup -- --dry-run
```

Обе команды сейчас эквивалентны и работают только в подготовительном режиме. Они проверяют
конфигурацию, локальное наличие `ssh` и `pg_dump`, создают каталог с правами `0700`, а затем
печатают план. Отсутствующий `pg_dump` отображается как предупреждение, пока реальный dump
намеренно отключён.

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
          <database>_YYYYMMDDTHHMMSSZ.dump
```

Формат dump — PostgreSQL custom (`pg_dump --format=custom`), чтобы поддержать выборочное и
параллельное восстановление через `pg_restore`. Каталог `backup/` исключён из Git. Перед
production-включением нужны политика retention, шифрование, копия на независимом хранилище и
мониторинг результата.

## Будущее восстановление

1. Выбрать backup и проверить его через `pg_restore --list <file>`.
2. Сверить версии `pg_dump`/`pg_restore` и целевого PostgreSQL.
3. Создать отдельную пустую БД восстановления; не восстанавливать сразу поверх production.
4. Выполнить `pg_restore --exit-on-error --clean --if-exists --no-owner --dbname=<target> <file>`.
5. Проверить схему, количество критичных записей и приложение на изолированной БД.
6. Переключение production выполнять только по отдельному утверждённому runbook.

## Условия включения реального backup

Потребуются отдельное утверждение, ограниченная SSH/DB role, безопасная аутентификация,
проверка host key, блокировка параллельных запусков, атомарная запись временного файла,
checksum, шифрование, retention, off-site копирование и регулярный тест восстановления.
