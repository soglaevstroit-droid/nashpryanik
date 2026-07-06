# 005 — Tasks API

## Назначение
Tasks API обслуживает создание, просмотр, взятие и завершение задач согласно логике монтажника и прораба.

## Endpoint: список задач

```http
GET /api/v1/tasks?objectId=2d899118-90d4-48cb-bccf-5881cf9637e7&status=free
```

## Response body

```json
{
  "data": [
    {
      "id": "60bb3322-c6f7-4963-861f-30b2c27f0a4d",
      "title": "Смонтировать кабель-канал",
      "objectId": "2d899118-90d4-48cb-bccf-5881cf9637e7",
      "status": "free",
      "deadlineAt": "2026-07-08T18:00:00Z",
      "isAvailableForCurrentUser": true
    }
  ],
  "meta": {
    "requestId": "req_tasks_list_001"
  }
}
```

## Endpoint: задача

```http
GET /api/v1/tasks/{taskId}
```

## Response body

```json
{
  "data": {
    "id": "60bb3322-c6f7-4963-861f-30b2c27f0a4d",
    "title": "Смонтировать кабель-канал",
    "description": "Выполнить монтаж по этапам",
    "status": "free",
    "objectId": "2d899118-90d4-48cb-bccf-5881cf9637e7",
    "assignees": [],
    "stepsCount": 3
  },
  "meta": {
    "requestId": "req_tasks_get_001"
  }
}
```

## Endpoint: создать задачу

```http
POST /api/v1/tasks
```

## Request body

```json
{
  "objectId": "2d899118-90d4-48cb-bccf-5881cf9637e7",
  "title": "Смонтировать кабель-канал",
  "description": "Выполнить монтаж по этапам",
  "locationNote": "2 этаж",
  "deadlineAt": "2026-07-08T18:00:00Z",
  "assigneeIds": [
    "8d32b7d6-8a0d-4d7c-a49d-f8a1a0aa6f41"
  ]
}
```

## Response body

```json
{
  "data": {
    "id": "60bb3322-c6f7-4963-861f-30b2c27f0a4d",
    "status": "assigned"
  },
  "meta": {
    "requestId": "req_tasks_create_001"
  }
}
```

## Endpoint: взять задачу

```http
POST /api/v1/tasks/{taskId}/take
```

## Request body

```json
{
  "workSessionId": "77f0d2cd-1e2b-4ad5-8f3e-42e1c1415420"
}
```

## Response body

```json
{
  "data": {
    "taskId": "60bb3322-c6f7-4963-861f-30b2c27f0a4d",
    "status": "in_progress",
    "currentWorkerId": "8d32b7d6-8a0d-4d7c-a49d-f8a1a0aa6f41"
  },
  "meta": {
    "requestId": "req_tasks_take_001"
  }
}
```

## Endpoint: завершить задачу

```http
POST /api/v1/tasks/{taskId}/complete
```

## Request body

```json
{
  "workSessionId": "77f0d2cd-1e2b-4ad5-8f3e-42e1c1415420"
}
```

## Response body

```json
{
  "data": {
    "taskId": "60bb3322-c6f7-4963-861f-30b2c27f0a4d",
    "status": "completed"
  },
  "meta": {
    "requestId": "req_tasks_complete_001"
  }
}
```

## Ошибки
- `TASK_NOT_FOUND`.
- `TASK_NOT_AVAILABLE`.
- `ACTIVE_TASK_EXISTS`.
- `WORK_SESSION_REQUIRED`.
- `FORBIDDEN`.

## Права доступа
- Монтажник: просмотр доступных задач, взятие задачи, завершение своей задачи.
- Прораб: создание задач и назначение исполнителей.
- Финансист: просмотр задач в аналитическом контексте без изменения.

## Связь с таблицами
- `tasks`;
- `task_assignees`;
- `task_steps`;
- `work_sessions`;
- `audit_log`.

## Связь с UI
- `001_Worker_Main`;
- `004_Task_Detail`;
- `005_Take_Task_Confirm`;
- `006_Task_In_Progress`;
- `017_Task_Create`;
- `033_Finance_Gantt`.
