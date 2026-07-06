# 013 — Error Handling

## Назначение
Документ описывает обработку ошибок frontend и связь с backend error format.

## Источники ошибок
- API validation;
- auth expired;
- forbidden;
- not found;
- conflict;
- photo upload;
- offline;
- rate limit;
- internal error.

## Mapping
- `UNAUTHORIZED` → session expired и переход на login.
- `FORBIDDEN` → экран доступа запрещен или disabled action.
- `VALIDATION_ERROR` → ошибки формы.
- `ACTIVE_TASK_EXISTS` → обновить список задач и показать активную задачу.
- `PAYMENT_CONFLICT` → показать конфликт выплаты.
- `PHOTO_UPLOAD_FAILED` → retry upload.
- `RATE_LIMITED` → показать retry after.

## UI presentation
Ошибки показываются:
- inline у поля;
- banner на экране;
- full-screen error state;
- retry block;
- системный экран камеры или загрузки фото.

## Request ID
Если backend вернул `requestId`, UI может показать его в технической детали для поддержки.

## Запрещено
- показывать stack trace пользователю;
- скрывать ошибку финансового действия;
- считать действие успешным без response backend.
