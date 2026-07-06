# 007 — Work Sessions API

## Назначение
Work Sessions API управляет началом и завершением рабочей смены. Монеты начисляются только во время активной смены.

## Endpoint: текущая смена

```http
GET /api/v1/work-sessions/current
```

## Response body

```json
{
  "data": {
    "id": "77f0d2cd-1e2b-4ad5-8f3e-42e1c1415420",
    "status": "working",
    "objectId": "2d899118-90d4-48cb-bccf-5881cf9637e7",
    "startedAt": "2026-07-06T08:00:00Z",
    "durationMinutes": 180
  },
  "meta": {
    "requestId": "req_sessions_current_001"
  }
}
```

## Endpoint: начать смену

```http
POST /api/v1/work-sessions/start
```

## Request body

```json
{
  "objectId": "2d899118-90d4-48cb-bccf-5881cf9637e7",
  "photoId": "83b7df2c-d264-44d0-8f16-dae2c8ae0a90"
}
```

## Response body

```json
{
  "data": {
    "id": "77f0d2cd-1e2b-4ad5-8f3e-42e1c1415420",
    "status": "working",
    "startedAt": "2026-07-06T08:00:00Z"
  },
  "meta": {
    "requestId": "req_sessions_start_001"
  }
}
```

## Endpoint: завершить смену

```http
POST /api/v1/work-sessions/{sessionId}/finish
```

## Request body

```json
{
  "photoId": "83b7df2c-d264-44d0-8f16-dae2c8ae0a90"
}
```

## Response body

```json
{
  "data": {
    "id": "77f0d2cd-1e2b-4ad5-8f3e-42e1c1415420",
    "status": "left",
    "finishedAt": "2026-07-06T17:00:00Z"
  },
  "meta": {
    "requestId": "req_sessions_finish_001"
  }
}
```

## Endpoint: история смен пользователя

```http
GET /api/v1/users/{userId}/work-sessions?periodFrom=2026-07-01&periodTo=2026-07-06
```

## Response body

```json
{
  "data": [
    {
      "id": "77f0d2cd-1e2b-4ad5-8f3e-42e1c1415420",
      "objectId": "2d899118-90d4-48cb-bccf-5881cf9637e7",
      "status": "left",
      "startedAt": "2026-07-06T08:00:00Z",
      "finishedAt": "2026-07-06T17:00:00Z",
      "durationMinutes": 540
    }
  ],
  "meta": {
    "requestId": "req_sessions_history_001"
  }
}
```

## Ошибки
- `ACTIVE_SESSION_EXISTS`.
- `WORK_SESSION_NOT_FOUND`.
- `PHOTO_REQUIRED`.
- `INVALID_WORK_SESSION_STATE`.
- `FORBIDDEN`.

## Права доступа
- Монтажник управляет своей сменой.
- Прораб и финансист просматривают смены в рамках своих экранов и роли.

## Связь с таблицами
- `work_sessions`;
- `users`;
- `objects`;
- `photos`;
- `audit_log`.

## Связь с UI
- `001_Worker_Main`;
- `002_Start_Work_Confirm`;
- `003_Start_Work_Camera`;
- `011_Finish_Work`;
- `031_Employee_Analytics`;
- `034_Employee_Details`.
