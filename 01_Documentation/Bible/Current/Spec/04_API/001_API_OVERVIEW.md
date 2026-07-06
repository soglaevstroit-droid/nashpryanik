# 001 — API Overview

## Назначение
API обеспечивает связь мобильного интерфейса с backend, PostgreSQL, файловым хранилищем, аналитикой, AI Engine и уведомлениями.

## Базовый URL
Все endpoint-ы используют версию:

```text
/api/v1
```

## Формат данных
По умолчанию API принимает и возвращает `application/json`. Исключение — загрузка фотографий, где используется `multipart/form-data`.

## Аутентификация
Защищенные endpoint-ы требуют заголовок:

```http
Authorization: Bearer <jwt>
```

JWT содержит `userId`, `companyId`, `role`, время выпуска и срок действия. Backend использует эти данные для RBAC и фильтрации по компании.

## Единый успешный ответ

```json
{
  "data": {
    "id": "2fd6f8f6-0b2a-4b7c-9f11-2cc7d1a47b20"
  },
  "meta": {
    "requestId": "req_20260706_001"
  }
}
```

## Единая ошибка

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Недостаточно прав для действия.",
    "details": {
      "requiredRole": "finance"
    },
    "requestId": "req_20260706_002"
  }
}
```

## Связь с БД
API использует PostgreSQL-таблицы:
- `companies`;
- `users`;
- `objects`;
- `tasks`;
- `task_assignees`;
- `task_steps`;
- `work_sessions`;
- `photos`;
- `coin_transactions`;
- `notifications`;
- `ai_recommendations`;
- `audit_log`;
- финансовые записи выплат, если модуль выплат реализован в БД.

## Связь с UI
Endpoint-ы обслуживают экраны UI Bible:
- монтажник: `001`-`014`;
- прораб: `015`-`020`;
- системные экраны: `021`-`028`;
- финансист: `029`-`040`.

## REST-правила
- `GET` получает данные.
- `POST` создает сущность или выполняет доменное действие.
- `PUT` полностью сохраняет настройки или ресурс, где это безопасно.
- `PATCH` меняет статус или часть данных.
- `DELETE` не используется для исторических бизнес-данных; применяется soft delete или archive endpoint.

## Пагинация

```json
{
  "data": [],
  "meta": {
    "limit": 50,
    "offset": 0,
    "total": 128
  }
}
```

## Фильтры
Типовые query-параметры:
- `companyId` берется из JWT и не передается клиентом для обычных запросов;
- `objectId`;
- `employeeId`;
- `periodFrom`;
- `periodTo`;
- `status`;
- `limit`;
- `offset`.

## Audit
API создает записи `audit_log` для:
- смен;
- задач;
- этапов;
- фото;
- монет;
- AI-рекомендаций;
- уведомлений;
- финансовых решений.
