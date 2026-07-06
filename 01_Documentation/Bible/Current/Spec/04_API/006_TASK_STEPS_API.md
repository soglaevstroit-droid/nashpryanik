# 006 — Task Steps API

## Назначение
Task Steps API обслуживает этапы задач: создание прорабом, просмотр и выполнение монтажником.

## Endpoint: список этапов задачи

```http
GET /api/v1/tasks/{taskId}/steps
```

## Response body

```json
{
  "data": [
    {
      "id": "c4d2d73c-57a8-478c-99a1-febf456857fd",
      "position": 1,
      "title": "Подготовить поверхность",
      "description": "Очистить место монтажа",
      "status": "not_started",
      "examplePhotoUrl": "/api/v1/photos/99f/view"
    }
  ],
  "meta": {
    "requestId": "req_steps_list_001"
  }
}
```

## Endpoint: создать этап

```http
POST /api/v1/tasks/{taskId}/steps
```

## Request body

```json
{
  "position": 1,
  "title": "Подготовить поверхность",
  "description": "Очистить место монтажа",
  "examplePhotoId": "99f54752-54d4-4c5b-973b-e071747d9c18"
}
```

## Response body

```json
{
  "data": {
    "id": "c4d2d73c-57a8-478c-99a1-febf456857fd",
    "status": "not_started"
  },
  "meta": {
    "requestId": "req_steps_create_001"
  }
}
```

## Endpoint: начать этап

```http
POST /api/v1/task-steps/{stepId}/start
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
    "stepId": "c4d2d73c-57a8-478c-99a1-febf456857fd",
    "status": "in_progress"
  },
  "meta": {
    "requestId": "req_steps_start_001"
  }
}
```

## Endpoint: завершить этап

```http
POST /api/v1/task-steps/{stepId}/complete
```

## Request body

```json
{
  "workSessionId": "77f0d2cd-1e2b-4ad5-8f3e-42e1c1415420",
  "photoId": "83b7df2c-d264-44d0-8f16-dae2c8ae0a90"
}
```

## Response body

```json
{
  "data": {
    "stepId": "c4d2d73c-57a8-478c-99a1-febf456857fd",
    "status": "completed",
    "coinsAdded": 10
  },
  "meta": {
    "requestId": "req_steps_complete_001"
  }
}
```

## Endpoint: невозможно выполнить

```http
POST /api/v1/task-steps/{stepId}/cannot-do
```

## Request body

```json
{
  "workSessionId": "77f0d2cd-1e2b-4ad5-8f3e-42e1c1415420",
  "reason": "Нет доступа к месту работ",
  "photoId": "83b7df2c-d264-44d0-8f16-dae2c8ae0a90"
}
```

## Response body

```json
{
  "data": {
    "stepId": "c4d2d73c-57a8-478c-99a1-febf456857fd",
    "status": "cannot_do"
  },
  "meta": {
    "requestId": "req_steps_cannot_do_001"
  }
}
```

## Ошибки
- `STEP_NOT_FOUND`.
- `PHOTO_REQUIRED`.
- `WORK_SESSION_REQUIRED`.
- `TASK_NOT_IN_PROGRESS`.
- `FORBIDDEN`.

## Права доступа
- Прораб создает этапы.
- Монтажник выполняет этапы своей задачи.
- Финансист просматривает этапы в аналитике без изменения.

## Связь с таблицами
- `task_steps`;
- `tasks`;
- `photos`;
- `work_sessions`;
- `coin_transactions`;
- `audit_log`.

## Связь с UI
- `007_Step_Work`;
- `008_Step_Confirm`;
- `009_Step_Done`;
- `010_Cannot_Do`;
- `018_Task_Step_Builder`;
- `033_Finance_Gantt`.
