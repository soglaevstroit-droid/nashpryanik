# 002 — Project Structure

## Назначение
Документ описывает рекомендуемую структуру каталогов backend. Структура поддерживает Service + Repository архитектуру и REST API `/api/v1`.

## Корневая структура

```text
backend/
  src/
    controllers/
    services/
    repositories/
    middleware/
    models/
    dto/
    validators/
    auth/
    uploads/
    jobs/
    notifications/
    ai/
    config/
    utils/
    errors/
    database/
    routes/
    app.js
    server.js
  tests/
```

## `controllers`
HTTP-контроллеры. Они принимают request, извлекают params/query/body/file, вызывают сервис и возвращают API response.

Контроллеры не содержат SQL и не принимают бизнес-решения.

## `services`
Бизнес-логика. Сервисы проверяют сценарные правила и вызывают репозитории.

Примеры:
- `TaskService`;
- `WorkSessionService`;
- `PhotoService`;
- `CoinService`;
- `FinanceService`;
- `AIService`.

## `repositories`
Доступ к PostgreSQL. Репозиторий знает структуру таблиц, индексы и транзакции, но не знает HTTP.

## `middleware`
Поперечные функции:
- JWT auth;
- RBAC;
- validation;
- rate limit;
- request id;
- logging;
- audit context;
- exception handler;
- CORS.

## `models`
Доменные модели и enum, соответствующие Database Bible.

## `dto`
Request и response DTO для API Bible. DTO отделяют HTTP-формат от внутренней модели.

## `validators`
Валидация входных данных: UUID, периоды, суммы, enum, multipart metadata.

## `auth`
JWT, refresh token, password hashing, logout и password reset.

## `uploads`
Временная обработка файлов перед передачей в storage. Временные файлы очищаются background job.

## `jobs`
Фоновые задачи: AI-анализ, уведомления, агрегаты, очистка, экспорт отчетов.

## `notifications`
Доставка in-app, push и email, если канал включен конфигурацией.

## `ai`
Клиент AI Engine, DTO контекста, обработка ответов и ограничений.

## `config`
Окружения, secrets, database URL, storage config, JWT config, rate limits.

## `utils`
Общие функции: дата, форматирование, request id, безопасная сериализация.

## `errors`
Классы ошибок, соответствующие `04_API/013_ERRORS.md`.

## `database`
Подключение PostgreSQL, migrations, transaction helper, query helpers.

## `routes`
Маршруты `/api/v1`, сгруппированные по API-документам.

## Правила структуры
- Контроллеры зависят от сервисов.
- Сервисы зависят от репозиториев и внешних клиентов.
- Репозитории не зависят от контроллеров и сервисов.
- Middleware не должен содержать доменную логику.
- Все новые endpoint-ы сначала описываются в API Bible.
