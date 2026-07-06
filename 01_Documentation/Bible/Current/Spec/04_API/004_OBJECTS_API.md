# 004 — Objects API

## Назначение
Objects API возвращает строительные объекты компании для задач, аналитики, фильтров, отчетов и финансовых экранов.

## Endpoint: список объектов

```http
GET /api/v1/objects?status=active&limit=50&offset=0
```

## Response body

```json
{
  "data": [
    {
      "id": "2d899118-90d4-48cb-bccf-5881cf9637e7",
      "name": "Объект А",
      "status": "active"
    }
  ],
  "meta": {
    "limit": 50,
    "offset": 0,
    "total": 1,
    "requestId": "req_objects_list_001"
  }
}
```

## Endpoint: объект

```http
GET /api/v1/objects/{objectId}
```

## Response body

```json
{
  "data": {
    "id": "2d899118-90d4-48cb-bccf-5881cf9637e7",
    "name": "Объект А",
    "description": "Монтажные работы",
    "status": "active",
    "createdAt": "2026-07-06T10:00:00Z"
  },
  "meta": {
    "requestId": "req_objects_get_001"
  }
}
```

## Endpoint: фильтры объектов для финансиста

```http
GET /api/v1/objects/filters/finance
```

## Response body

```json
{
  "data": {
    "objects": [
      {
        "id": "2d899118-90d4-48cb-bccf-5881cf9637e7",
        "name": "Объект А"
      }
    ]
  },
  "meta": {
    "requestId": "req_objects_finance_filters_001"
  }
}
```

## Ошибки
- `UNAUTHORIZED`.
- `FORBIDDEN`.
- `OBJECT_NOT_FOUND`.

## Права доступа
Доступ имеют авторизованные роли в пределах компании. Данные объектов фильтруются по `company_id` из JWT.

## Связь с таблицами
- `companies`;
- `objects`;
- `tasks`;
- `work_sessions`;
- `coin_transactions`;
- `ai_recommendations`.

## Связь с UI
- списки задач монтажника;
- экраны прораба;
- финансовая аналитика `030`, `033`, `036`, `038`, `040`.
