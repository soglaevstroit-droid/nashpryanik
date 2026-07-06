# 008 — Middleware

## Назначение
Middleware выполняет общие задачи до и после контроллеров: идентификация запроса, аутентификация, авторизация, валидация, логирование, rate limit, audit context, CORS и обработка исключений.

## Request ID Middleware
Создает или принимает `X-Request-Id` и записывает его в `requestContext`.

Используется в:
- логах;
- ошибках API;
- audit log;
- трассировке фоновых задач.

## Auth Middleware
Проверяет JWT:
- наличие `Authorization: Bearer`;
- подпись;
- срок действия;
- `sub`, `companyId`, `role`.

При ошибке возвращает `UNAUTHORIZED`.

## RBAC Middleware
Проверяет, что роль пользователя входит в список разрешенных ролей endpoint-а.

Пример:
- `POST /api/v1/tasks` разрешен `foreman`;
- `POST /api/v1/finance/payments` разрешен `finance`;
- `POST /api/v1/task-steps/{id}/complete` разрешен `worker`.

## Validation Middleware
Проверяет:
- UUID;
- enum;
- периоды;
- суммы;
- required поля;
- multipart metadata;
- лимиты размера файла.

Ошибки возвращаются в формате `VALIDATION_ERROR`.

## Logging Middleware
Пишет технический лог запроса:
- request id;
- method;
- path;
- status;
- duration;
- user id;
- company id;
- role.

## Audit Middleware
Создает audit context. Сам audit event пишет сервис, когда действие действительно изменило доменное состояние.

## Rate Limit Middleware
Применяет лимиты из API Bible:
- login;
- GET;
- POST;
- photo upload;
- report export.

## Exception Middleware
Перехватывает ошибки и переводит их в единый формат API:

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Внутренняя ошибка сервера.",
    "requestId": "req_001"
  }
}
```

## CORS Middleware
Разрешает запросы только с доверенных frontend-origin. CORS не является механизмом авторизации и не заменяет JWT.

## Порядок выполнения
1. Request ID.
2. CORS.
3. Logging start.
4. Body parser или multipart parser.
5. Auth.
6. RBAC.
7. Validation.
8. Controller.
9. Logging finish.
10. Exception handler.
