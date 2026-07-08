# LOCAL VERIFICATION CHECKLIST

Документ описывает локальную проверку development environment СТРОИТ.РФ на машине разработчика.

## Требования к машине

- Git установлен.
- Node.js 22 установлен.
- npm доступен.
- Docker Desktop установлен и запущен.
- Make доступен.
- Flutter SDK нужен только для следующих mobile-миссий; текущая миссия не требует запуска Flutter-приложения.

## Подготовка

```bash
git clone <repository-url>
cd <repository-directory>
npm ci
```

Ожидаемый результат:

- зависимости установлены из `package-lock.json`;
- папка `node_modules` создана локально и не попадает в git;
- команда завершается без ошибки установки.

Если возникает ошибка:

- проверьте версию Node.js;
- выполните `npm cache verify`;
- удалите локальную папку `node_modules`;
- повторите `npm ci`.

## Проверка структуры

```bash
./scripts/check-structure.sh
```

Ожидаемый результат:

```text
Repository foundation structure is present
```

Если возникает ошибка:

- проверьте, что все файлы из сообщения об ошибке существуют;
- не создавайте прикладной код для исправления структуры;
- восстановите отсутствующий infrastructure или README-файл из git.

## Проверка Docker Compose синтаксиса

```bash
docker compose --env-file .env.example -f infra/docker/docker-compose.yml config
```

Ожидаемый результат:

- Docker Compose выводит итоговую конфигурацию;
- ошибок парсинга YAML или переменных окружения нет.

Если возникает ошибка:

- проверьте, что Docker Desktop запущен;
- проверьте наличие `.env.example`;
- проверьте, что порты `5432`, `6379`, `9000`, `9001` не конфликтуют с локальными сервисами.

## Запуск сервисов

```bash
make up
```

Ожидаемый результат:

- контейнер `stroit-postgres` запущен;
- контейнер `stroit-redis` запущен;
- контейнер `stroit-minio` запущен.

Должны быть доступны сервисы:

- PostgreSQL: `localhost:5432`;
- Redis: `localhost:6379`;
- MinIO API: `http://localhost:9000`;
- MinIO Console: `http://localhost:9001`.

Если возникает ошибка:

- проверьте, что Docker Desktop запущен;
- проверьте занятость портов;
- выполните `make logs`;
- при необходимости выполните `make clean`, затем `make up`.

## Проверка статуса

```bash
make status
```

Ожидаемый результат:

- PostgreSQL, Redis и MinIO отображаются в списке сервисов;
- сервисы находятся в состоянии running или healthy после завершения healthcheck.

Если возникает ошибка:

- выполните `make logs`;
- проверьте healthcheck конкретного контейнера;
- убедитесь, что `.env` не содержит некорректных локальных значений.

## Проверка логов

```bash
make logs
```

Ожидаемый результат:

- Docker Compose показывает логи PostgreSQL, Redis и MinIO;
- нет бесконечных restart-loop.

Если возникает ошибка:

- остановите сервисы через `make down`;
- проверьте Docker Desktop;
- повторите `make up`.

## Healthcheck

```bash
./scripts/healthcheck.sh
```

Ожидаемый результат:

```text
Development services are running
```

Если возникает ошибка:

- выполните `make status`;
- выполните `make logs`;
- дождитесь завершения startup healthcheck;
- проверьте локальные порты и значения `.env`.

## Проверка Database Foundation

Этот блок подтверждает, что Prisma/PostgreSQL foundation работает против реально поднятого локального PostgreSQL.

```bash
make up
make status
npm run prisma:generate
npm run prisma:migrate
```

Ожидаемый результат:

- контейнер `stroit-postgres` находится в состоянии running или healthy;
- Prisma Client успешно генерируется;
- initial migration применяется без создания доменных таблиц;
- в базе появляется только служебная история миграций Prisma.

После применения migration запустите backend:

```bash
npm run start -w @stroit/backend
```

В отдельном терминале проверьте health endpoints:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/health/ready
```

Ожидаемый результат для `/health`:

```json
{
  "status": "ok",
  "appName": "СТРОИТ.РФ",
  "environment": "development",
  "timestamp": "<ISO timestamp>"
}
```

Ожидаемый результат для `/health/ready`:

```json
{
  "status": "ok",
  "appName": "СТРОИТ.РФ",
  "environment": "development",
  "timestamp": "<ISO timestamp>",
  "database": {
    "connected": true
  }
}
```

Если `/health/ready` возвращает `database.connected: false`:

- убедитесь, что Docker Desktop запущен;
- выполните `make status` и проверьте состояние `stroit-postgres`;
- проверьте `DATABASE_URL` в `.env` или `.env.example`;
- выполните `make logs` и проверьте логи PostgreSQL;
- повторите `npm run prisma:migrate` после восстановления соединения с PostgreSQL.

## Сброс окружения

```bash
make reset
```

Ожидаемый результат:

- containers и volumes удалены;
- сервисы запущены заново;
- `make status` показывает актуальные контейнеры.

Если возникает ошибка:

- выполните `make clean`;
- проверьте Docker Desktop;
- повторите `make up`.

## Остановка

```bash
make down
```

Ожидаемый результат:

- контейнеры остановлены;
- volumes сохранены.

## Полная очистка

```bash
make clean
```

Ожидаемый результат:

- контейнеры остановлены;
- Docker volumes development environment удалены.

## Проверка качества

```bash
npm run lint
npm run lint:md
npm run lint:yaml
npm run format:check
git diff --check
```

Ожидаемый результат:

- все команды завершаются без ошибок;
- проверяется только engineering platform зона, а не утвержденный Bible-корпус.

Если возникает ошибка:

- исправляйте только platform/config files;
- не меняйте Foundation, Rule Bible, Event Bible или бизнес-документацию в рамках environment stabilization.

## Что не проверяется в этой миссии

- backend API;
- бизнес-логика;
- Prisma schema;
- Event Engine;
- Process Engine;
- Flutter screens;
- AI logic.
