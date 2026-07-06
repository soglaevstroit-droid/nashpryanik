# 003 — Users API

## Назначение
Users API возвращает сотрудников, профили и рабочие статусы в рамках компании из JWT.

## Endpoint: список сотрудников

```http
GET /api/v1/users?role=worker&workStatus=working&limit=50&offset=0
```

## Response body

```json
{
  "data": [
    {
      "id": "8d32b7d6-8a0d-4d7c-a49d-f8a1a0aa6f41",
      "fullName": "Алексей Монтажник",
      "role": "worker",
      "workStatus": "working",
      "photoUrl": "/api/v1/photos/4cf1/view",
      "isActive": true
    }
  ],
  "meta": {
    "limit": 50,
    "offset": 0,
    "total": 1,
    "requestId": "req_users_list_001"
  }
}
```

## Endpoint: профиль пользователя

```http
GET /api/v1/users/{userId}
```

## Response body

```json
{
  "data": {
    "id": "8d32b7d6-8a0d-4d7c-a49d-f8a1a0aa6f41",
    "fullName": "Алексей Монтажник",
    "role": "worker",
    "workStatus": "working",
    "objectIds": [
      "2d899118-90d4-48cb-bccf-5881cf9637e7"
    ],
    "currentTaskId": "60bb3322-c6f7-4963-861f-30b2c27f0a4d",
    "coinsBalance": 120
  },
  "meta": {
    "requestId": "req_users_get_001"
  }
}
```

## Endpoint: работающие сейчас

```http
GET /api/v1/users/working-now?objectId=2d899118-90d4-48cb-bccf-5881cf9637e7
```

## Response body

```json
{
  "data": {
    "count": 12,
    "employees": [
      {
        "id": "8d32b7d6-8a0d-4d7c-a49d-f8a1a0aa6f41",
        "fullName": "Алексей Монтажник",
        "objectName": "Объект А",
        "currentShiftDurationMinutes": 180
      }
    ]
  },
  "meta": {
    "requestId": "req_users_working_001"
  }
}
```

## Ошибки
- `UNAUTHORIZED`.
- `FORBIDDEN`.
- `USER_NOT_FOUND`.
- `VALIDATION_ERROR`.

## Права доступа
- Монтажник видит свой профиль и базовую информацию, разрешенную UI.
- Прораб видит сотрудников своей компании для рабочих экранов.
- Финансист видит сотрудников для аналитики и выплат.
- Руководитель использует доступ в рамках управленческой аналитики.

## Связь с таблицами
- `users`;
- `objects`;
- `work_sessions`;
- `tasks`;
- `coin_transactions`.

## Связь с UI
- `001_Worker_Main`;
- `013_Worker_Profile`;
- `015_Foreman_Employees`;
- `016_Foreman_Employee_Card`;
- `029_Finance_Main`;
- `034_Employee_Details`.
