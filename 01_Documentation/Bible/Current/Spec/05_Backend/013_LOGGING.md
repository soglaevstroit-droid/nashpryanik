# 013 — Logging

## Назначение
Логирование обеспечивает наблюдаемость backend без раскрытия секретов и персональных данных сверх необходимости.

## Уровни логов
- `debug` — техническая диагностика в dev.
- `info` — успешные запросы, jobs, внешние вызовы.
- `warn` — нестандартные, но обработанные ситуации.
- `error` — ошибки запросов, jobs, storage, AI, database.
- `security` — подозрительные действия и отказы доступа.

## Что логируется
- `requestId`;
- method;
- path;
- status code;
- duration;
- user id;
- company id;
- role;
- error code;
- job name;
- external integration name.

## Что не логируется
- пароль;
- refresh token;
- access token;
- полное содержимое файлов;
- секреты окружения;
- чувствительные финансовые комментарии без необходимости.

## Формат

```json
{
  "level": "info",
  "requestId": "req_001",
  "method": "POST",
  "path": "/api/v1/tasks/123/take",
  "status": 200,
  "durationMs": 42,
  "userId": "8d32b7d6-8a0d-4d7c-a49d-f8a1a0aa6f41",
  "companyId": "1d6cbb51-bf41-4c6d-a1e9-0a8c1d6b9f30",
  "role": "worker"
}
```

## Хранение
Логи хранятся отдельно от `audit_log`. Audit является бизнес-историей, logs являются технической наблюдаемостью.

## Связь с ошибками
Каждая ошибка API имеет `requestId`. По нему можно найти технический лог без раскрытия деталей клиенту.
