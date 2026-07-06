# 011 — AI Recommendations API

## Назначение
AI Recommendations API возвращает рекомендации ИИ. ИИ только рекомендует и не утверждает выплаты.

## Endpoint: список рекомендаций

```http
GET /api/v1/ai-recommendations?periodFrom=2026-07-01&periodTo=2026-07-06&status=ready
```

## Response body

```json
{
  "data": [
    {
      "id": "4d4447e4-a8d2-452a-bd34-4b3f21f6a211",
      "employeeId": "8d32b7d6-8a0d-4d7c-a49d-f8a1a0aa6f41",
      "employeeName": "Алексей Монтажник",
      "paidCoins": 120,
      "aiEstimatedCoins": 150,
      "difference": 30,
      "recommendationType": "bonus_recommended",
      "confidence": 0.82,
      "status": "ready"
    }
  ],
  "meta": {
    "requestId": "req_ai_list_001"
  }
}
```

## Endpoint: рекомендация

```http
GET /api/v1/ai-recommendations/{recommendationId}
```

## Response body

```json
{
  "data": {
    "id": "4d4447e4-a8d2-452a-bd34-4b3f21f6a211",
    "employeeId": "8d32b7d6-8a0d-4d7c-a49d-f8a1a0aa6f41",
    "periodFrom": "2026-07-01",
    "periodTo": "2026-07-06",
    "paidCoins": 120,
    "aiEstimatedCoins": 150,
    "difference": 30,
    "recommendationType": "bonus_recommended",
    "explanation": {
      "signals": [
        "closed_tasks_above_expected",
        "fast_step_completion"
      ],
      "summary": "Факт выполнения выше ожиданий за период."
    }
  },
  "meta": {
    "requestId": "req_ai_get_001"
  }
}
```

## Endpoint: отметить просмотренной

```http
POST /api/v1/ai-recommendations/{recommendationId}/view
```

## Response body

```json
{
  "data": {
    "id": "4d4447e4-a8d2-452a-bd34-4b3f21f6a211",
    "status": "viewed"
  },
  "meta": {
    "requestId": "req_ai_view_001"
  }
}
```

## Endpoint: зафиксировать решение человека

```http
POST /api/v1/ai-recommendations/{recommendationId}/decision
```

## Request body

```json
{
  "decision": "deferred",
  "comment": "Решение будет принято после проверки истории активности."
}
```

## Response body

```json
{
  "data": {
    "id": "4d4447e4-a8d2-452a-bd34-4b3f21f6a211",
    "status": "human_decision_recorded"
  },
  "meta": {
    "requestId": "req_ai_decision_001"
  }
}
```

## Ошибки
- `AI_RECOMMENDATION_NOT_FOUND`.
- `FORBIDDEN`.
- `VALIDATION_ERROR`.
- `AI_ANALYSIS_ERROR`.

## Права доступа
Финансист просматривает рекомендации и фиксирует решение. ИИ не получает прав утверждающего.

## Связь с таблицами
- `ai_recommendations`;
- `users`;
- `objects`;
- `coin_transactions`;
- `work_sessions`;
- `tasks`;
- `task_steps`;
- `notifications`;
- `audit_log`.

## Связь с UI
- `032_AI_Recommendations`;
- `034_Employee_Details`;
- `035_Payments`;
- `037_Efficiency_Analytics`;
- `039_Finance_Notifications`.
