# 010 — Finance API

## Назначение
Finance API обслуживает финансовые экраны: главная финансиста, аналитика, выплаты, история выплат, отчеты и настройки. ИИ не утверждает выплаты, финальное решение принимает финансист.

## Endpoint: главная финансиста

```http
GET /api/v1/finance/summary
```

## Response body

```json
{
  "data": {
    "totalCoins": 18420,
    "workingEmployeesCount": 12,
    "updatedAt": "2026-07-06T10:00:00Z"
  },
  "meta": {
    "requestId": "req_finance_summary_001"
  }
}
```

## Endpoint: общая аналитика

```http
GET /api/v1/finance/analytics?periodFrom=2026-07-01&periodTo=2026-07-06&objectId=2d899118-90d4-48cb-bccf-5881cf9637e7
```

## Response body

```json
{
  "data": {
    "totalCoins": 18420,
    "totalWorkDurationMinutes": 6420,
    "byDays": [
      {
        "date": "2026-07-06",
        "coins": 3200,
        "workDurationMinutes": 960
      }
    ],
    "byObjects": [
      {
        "objectId": "2d899118-90d4-48cb-bccf-5881cf9637e7",
        "objectName": "Объект А",
        "coins": 18420
      }
    ],
    "byEmployees": [
      {
        "employeeId": "8d32b7d6-8a0d-4d7c-a49d-f8a1a0aa6f41",
        "employeeName": "Алексей Монтажник",
        "coins": 120
      }
    ]
  },
  "meta": {
    "requestId": "req_finance_analytics_001"
  }
}
```

## Endpoint: карточка сотрудника

```http
GET /api/v1/finance/employees/{employeeId}/details?periodFrom=2026-07-01&periodTo=2026-07-06
```

## Response body

```json
{
  "data": {
    "employeeId": "8d32b7d6-8a0d-4d7c-a49d-f8a1a0aa6f41",
    "fullName": "Алексей Монтажник",
    "workStatus": "working",
    "earnedCoins": 120,
    "totalWorkDurationMinutes": 540,
    "completedTasksCount": 3,
    "currentTask": {
      "taskId": "60bb3322-c6f7-4963-861f-30b2c27f0a4d",
      "title": "Смонтировать кабель-канал"
    }
  },
  "meta": {
    "requestId": "req_finance_employee_details_001"
  }
}
```

## Endpoint: черновик выплаты

```http
GET /api/v1/finance/payments/draft?employeeId=8d32b7d6-8a0d-4d7c-a49d-f8a1a0aa6f41&periodFrom=2026-07-01&periodTo=2026-07-06&recommendationId=4d4447e4-a8d2-452a-bd34-4b3f21f6a211
```

## Response body

```json
{
  "data": {
    "employeeId": "8d32b7d6-8a0d-4d7c-a49d-f8a1a0aa6f41",
    "employeeName": "Алексей Монтажник",
    "earnedCoins": 120,
    "aiRecommendedBonus": 30,
    "bonus": 0,
    "comment": "",
    "totalAmount": 120
  },
  "meta": {
    "requestId": "req_payment_draft_001"
  }
}
```

## Endpoint: создать выплату

```http
POST /api/v1/finance/payments
```

## Request body

```json
{
  "employeeId": "8d32b7d6-8a0d-4d7c-a49d-f8a1a0aa6f41",
  "objectId": "2d899118-90d4-48cb-bccf-5881cf9637e7",
  "periodFrom": "2026-07-01",
  "periodTo": "2026-07-06",
  "earnedCoins": 120,
  "aiRecommendedBonus": 30,
  "bonus": 25,
  "comment": "Премия за результат выше ожиданий",
  "totalAmount": 145,
  "recommendationId": "4d4447e4-a8d2-452a-bd34-4b3f21f6a211"
}
```

## Response body

```json
{
  "data": {
    "paymentId": "0a3340d3-e83c-461c-87ec-cc67df5f5d45",
    "status": "approved_by_finance",
    "totalAmount": 145,
    "approvedBy": "1e0a2c31-d1fa-4c58-a8d3-3e0279f89d22",
    "paidAt": "2026-07-06T12:00:00Z"
  },
  "meta": {
    "requestId": "req_payment_create_001"
  }
}
```

## Endpoint: история выплат

```http
GET /api/v1/finance/payments/history?periodFrom=2026-07-01&periodTo=2026-07-06&objectId=2d899118-90d4-48cb-bccf-5881cf9637e7
```

## Response body

```json
{
  "data": [
    {
      "paymentId": "0a3340d3-e83c-461c-87ec-cc67df5f5d45",
      "employeeName": "Алексей Монтажник",
      "objectName": "Объект А",
      "earnedCoins": 120,
      "aiRecommendedBonus": 30,
      "bonus": 25,
      "totalAmount": 145,
      "approvedBy": "Мария Финансова",
      "paidAt": "2026-07-06T12:00:00Z"
    }
  ],
  "meta": {
    "requestId": "req_payment_history_001"
  }
}
```

## Endpoint: отчет

```http
GET /api/v1/finance/reports?periodFrom=2026-07-01&periodTo=2026-07-06&format=json
```

## Response body

```json
{
  "data": {
    "periodFrom": "2026-07-01",
    "periodTo": "2026-07-06",
    "rows": [
      {
        "employeeId": "8d32b7d6-8a0d-4d7c-a49d-f8a1a0aa6f41",
        "earnedCoins": 120,
        "bonus": 25,
        "totalAmount": 145,
        "aiRecommendation": "bonus_recommended"
      }
    ]
  },
  "meta": {
    "requestId": "req_finance_report_001"
  }
}
```

## Ошибки
- `FORBIDDEN`.
- `EMPLOYEE_NOT_FOUND`.
- `PAYMENT_CONFLICT`.
- `VALIDATION_ERROR`.
- `AI_RECOMMENDATION_NOT_FOUND`.

## Права доступа
Только роль `finance` может создавать выплаты. Прораб и монтажник не имеют доступа к финансовым действиям.

## Связь с таблицами
- `users`;
- `objects`;
- `work_sessions`;
- `coin_transactions`;
- `ai_recommendations`;
- `notifications`;
- `audit_log`;
- финансовые записи выплат.

## Связь с UI
- `029_Finance_Main`;
- `030_Total_Coins`;
- `031_Employee_Analytics`;
- `034_Employee_Details`;
- `035_Payments`;
- `036_Payment_History`;
- `037_Efficiency_Analytics`;
- `038_Financial_Reports`.
