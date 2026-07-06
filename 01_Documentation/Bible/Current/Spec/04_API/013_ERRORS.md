# 013 — Errors

## Назначение
Документ фиксирует единый формат ошибок API.

## Формат ошибки

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Некорректные данные запроса.",
    "details": {
      "field": "periodFrom",
      "reason": "periodFrom не может быть позже periodTo"
    },
    "requestId": "req_error_001"
  }
}
```

## HTTP status mapping
- `400` — `VALIDATION_ERROR`, `INVALID_STATE`.
- `401` — `UNAUTHORIZED`, `TOKEN_EXPIRED`, `TOKEN_INVALID`.
- `403` — `FORBIDDEN`.
- `404` — `USER_NOT_FOUND`, `OBJECT_NOT_FOUND`, `TASK_NOT_FOUND`, `STEP_NOT_FOUND`, `PHOTO_NOT_FOUND`, `NOTIFICATION_NOT_FOUND`, `AI_RECOMMENDATION_NOT_FOUND`.
- `409` — `ACTIVE_SESSION_EXISTS`, `ACTIVE_TASK_EXISTS`, `PAYMENT_CONFLICT`, `VERSION_CONFLICT`.
- `413` — `FILE_TOO_LARGE`.
- `415` — `UNSUPPORTED_MEDIA_TYPE`.
- `429` — `RATE_LIMITED`.
- `500` — `INTERNAL_ERROR`.

## Пример ошибки доступа

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Роль worker не может создать выплату.",
    "details": {
      "requiredRole": "finance",
      "currentRole": "worker"
    },
    "requestId": "req_forbidden_001"
  }
}
```

## Пример ошибки состояния

```json
{
  "error": {
    "code": "ACTIVE_TASK_EXISTS",
    "message": "У сотрудника уже есть задача в работе.",
    "details": {
      "activeTaskId": "60bb3322-c6f7-4963-861f-30b2c27f0a4d"
    },
    "requestId": "req_active_task_001"
  }
}
```

## Правила
- Ошибка должна быть объяснима пользователю.
- `requestId` обязателен.
- В `details` нельзя отдавать секреты, пароли и токены.
- Backend не должен переводить сущность в финальное состояние при ошибке.
- Финансовые конфликты должны возвращать `409`.
