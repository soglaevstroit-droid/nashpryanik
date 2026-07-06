# 012 — Notifications API

## Назначение
Notifications API возвращает уведомления и меняет их статус. Уведомление не выполняет финансовое действие автоматически.

## Endpoint: список уведомлений

```http
GET /api/v1/notifications?status=new&type=ai_recommendation&limit=50&offset=0
```

## Response body

```json
{
  "data": [
    {
      "id": "9e582b67-b92e-4b43-8a3a-bf7e2c72cbaf",
      "type": "ai_recommendation",
      "status": "new",
      "priority": "normal",
      "title": "Новая рекомендация ИИ",
      "description": "ИИ рекомендует проверить премию сотрудника.",
      "relatedEntityType": "ai_recommendation",
      "relatedEntityId": "4d4447e4-a8d2-452a-bd34-4b3f21f6a211",
      "createdAt": "2026-07-06T11:00:00Z"
    }
  ],
  "meta": {
    "limit": 50,
    "offset": 0,
    "total": 1,
    "requestId": "req_notifications_list_001"
  }
}
```

## Endpoint: отметить просмотренным

```http
POST /api/v1/notifications/{notificationId}/read
```

## Response body

```json
{
  "data": {
    "id": "9e582b67-b92e-4b43-8a3a-bf7e2c72cbaf",
    "status": "viewed",
    "readAt": "2026-07-06T11:10:00Z"
  },
  "meta": {
    "requestId": "req_notifications_read_001"
  }
}
```

## Endpoint: отметить обработанным

```http
POST /api/v1/notifications/{notificationId}/resolve
```

## Request body

```json
{
  "comment": "Рекомендация проверена финансистом."
}
```

## Response body

```json
{
  "data": {
    "id": "9e582b67-b92e-4b43-8a3a-bf7e2c72cbaf",
    "status": "resolved",
    "resolvedAt": "2026-07-06T11:15:00Z"
  },
  "meta": {
    "requestId": "req_notifications_resolve_001"
  }
}
```

## Ошибки
- `NOTIFICATION_NOT_FOUND`.
- `FORBIDDEN`.
- `VALIDATION_ERROR`.

## Права доступа
Пользователь видит уведомления своей роли или адресованные лично ему. Backend проверяет доступ к связанной сущности.

## Связь с таблицами
- `notifications`;
- `users`;
- `objects`;
- `ai_recommendations`;
- `audit_log`.

## Связь с UI
- `039_Finance_Notifications`;
- финансовые экраны, где отображается индикатор уведомлений.
