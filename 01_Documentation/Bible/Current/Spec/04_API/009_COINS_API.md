# 009 — Coins API

## Назначение
Coins API возвращает баланс и историю монет. Начисление монет выполняется backend при подтвержденных рабочих событиях в статусе `На работе`.

## Endpoint: баланс текущего пользователя

```http
GET /api/v1/coins/balance
```

## Response body

```json
{
  "data": {
    "userId": "8d32b7d6-8a0d-4d7c-a49d-f8a1a0aa6f41",
    "balance": 120
  },
  "meta": {
    "requestId": "req_coins_balance_001"
  }
}
```

## Endpoint: история монет сотрудника

```http
GET /api/v1/users/{userId}/coins?periodFrom=2026-07-01&periodTo=2026-07-06
```

## Response body

```json
{
  "data": [
    {
      "id": "9c5f5c3d-f772-43a8-94a4-177fef56555f",
      "amount": 10,
      "transactionType": "earned",
      "taskId": "60bb3322-c6f7-4963-861f-30b2c27f0a4d",
      "stepId": "c4d2d73c-57a8-478c-99a1-febf456857fd",
      "createdAt": "2026-07-06T09:20:00Z"
    }
  ],
  "meta": {
    "requestId": "req_coins_history_001"
  }
}
```

## Endpoint: агрегаты монет по объекту

```http
GET /api/v1/coins/summary?objectId=2d899118-90d4-48cb-bccf-5881cf9637e7&periodFrom=2026-07-01&periodTo=2026-07-06
```

## Response body

```json
{
  "data": {
    "totalCoins": 18420,
    "objectId": "2d899118-90d4-48cb-bccf-5881cf9637e7",
    "periodFrom": "2026-07-01",
    "periodTo": "2026-07-06"
  },
  "meta": {
    "requestId": "req_coins_summary_001"
  }
}
```

## Ошибки
- `FORBIDDEN`.
- `USER_NOT_FOUND`.
- `OBJECT_NOT_FOUND`.
- `VALIDATION_ERROR`.

## Права доступа
- Монтажник видит свой баланс и свою историю.
- Прораб видит монеты сотрудников в рабочих экранах.
- Финансист видит монеты для аналитики, выплат и отчетов.

## Связь с таблицами
- `coin_transactions`;
- `users`;
- `objects`;
- `tasks`;
- `task_steps`;
- `work_sessions`.

## Связь с UI
- `001_Worker_Main`;
- `013_Worker_Profile`;
- `015_Foreman_Employees`;
- `029_Finance_Main`;
- `030_Total_Coins`;
- `031_Employee_Analytics`;
- `035_Payments`;
- `038_Financial_Reports`.
