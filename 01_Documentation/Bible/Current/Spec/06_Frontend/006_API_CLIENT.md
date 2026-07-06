# 006 — API Client

## Назначение
API client реализует связь Flutter-приложения с backend REST API `/api/v1`.

## Base URL

```text
/api/v1
```

## Interceptors
- `RequestIdInterceptor` — добавляет request id.
- `AuthInterceptor` — добавляет access token.
- `RefreshTokenInterceptor` — обновляет token при `TOKEN_EXPIRED`.
- `ErrorMappingInterceptor` — переводит API error в frontend error.
- `LoggingInterceptor` — пишет безопасные debug logs без secrets.

## JWT
Каждый protected request отправляет:

```http
Authorization: Bearer <accessToken>
```

## Refresh Token
При `401 TOKEN_EXPIRED` client вызывает `/auth/refresh`. Если refresh неуспешен, session закрывается и пользователь возвращается на login.

## Retry
Retry допустим для:
- `GET`;
- upload chunk или повтор фото после сетевой ошибки;
- безопасных status updates, если есть idempotency key.

Retry не должен автоматически повторять создание выплаты без защиты от `PAYMENT_CONFLICT`.

## Timeout
Рекомендуемые таймауты:
- обычные запросы: 15 секунд;
- загрузка фото: 60 секунд;
- отчет export: через job/status, если операция долгая.

## Serialization
DTO соответствуют API Bible. Dates передаются ISO 8601. UUID передаются строками.

## Error Mapping
Коды backend:
- `VALIDATION_ERROR`;
- `FORBIDDEN`;
- `ACTIVE_TASK_EXISTS`;
- `PAYMENT_CONFLICT`;
- `PHOTO_UPLOAD_FAILED`;
- `RATE_LIMITED`.

Frontend отображает эти ошибки в состояниях UI без раскрытия технических деталей.

## Связь с backend
API client не знает SQL, storage и AI напрямую. Он общается только с backend.
