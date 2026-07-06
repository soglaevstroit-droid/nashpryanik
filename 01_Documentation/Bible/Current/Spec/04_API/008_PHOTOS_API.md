# 008 — Photos API

## Назначение
Photos API загружает фотографии через `multipart/form-data` и возвращает метаданные для связи с задачами, этапами и сменами.

## Endpoint: загрузить фото

```http
POST /api/v1/photos
Content-Type: multipart/form-data
```

## Form fields
- `file` — файл изображения.
- `photoType` — тип из `photo_type`.
- `objectId` — объект, если применимо.
- `taskId` — задача, если применимо.
- `stepId` — этап, если применимо.
- `workSessionId` — смена, если применимо.

## Response body

```json
{
  "data": {
    "id": "83b7df2c-d264-44d0-8f16-dae2c8ae0a90",
    "photoType": "step_result",
    "status": "uploaded",
    "url": "/api/v1/photos/83b7df2c-d264-44d0-8f16-dae2c8ae0a90/view",
    "createdAt": "2026-07-06T09:15:00Z"
  },
  "meta": {
    "requestId": "req_photos_upload_001"
  }
}
```

## Endpoint: метаданные фото

```http
GET /api/v1/photos/{photoId}
```

## Response body

```json
{
  "data": {
    "id": "83b7df2c-d264-44d0-8f16-dae2c8ae0a90",
    "uploadedBy": "8d32b7d6-8a0d-4d7c-a49d-f8a1a0aa6f41",
    "photoType": "step_result",
    "status": "uploaded",
    "taskId": "60bb3322-c6f7-4963-861f-30b2c27f0a4d",
    "stepId": "c4d2d73c-57a8-478c-99a1-febf456857fd"
  },
  "meta": {
    "requestId": "req_photos_get_001"
  }
}
```

## Endpoint: просмотр файла

```http
GET /api/v1/photos/{photoId}/view
```

## Response
Возвращает файл изображения или временную безопасную ссылку, если storage работает через signed URL.

## Ошибки
- `PHOTO_NOT_FOUND`.
- `PHOTO_REQUIRED`.
- `PHOTO_UPLOAD_FAILED`.
- `PHOTO_VALIDATION_FAILED`.
- `UNSUPPORTED_MEDIA_TYPE`.
- `FORBIDDEN`.

## Права доступа
- Монтажник загружает фото своих действий.
- Прораб загружает фото-примеры этапов и просматривает фото своих задач.
- Финансист просматривает фото как источник фактов, если оно доступно его роли.

## Связь с таблицами
- `photos`;
- `users`;
- `objects`;
- `tasks`;
- `task_steps`;
- `work_sessions`;
- `audit_log`.

## Связь с UI
- `003_Start_Work_Camera`;
- `007_Step_Work`;
- `008_Step_Confirm`;
- `010_Cannot_Do`;
- `018_Task_Step_Builder`;
- `021_System_Camera_Error`;
- `022_System_Photo_Uploading`.
