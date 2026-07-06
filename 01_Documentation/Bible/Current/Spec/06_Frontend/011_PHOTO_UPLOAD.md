# 011 — Photo Upload

## Назначение
Документ описывает загрузку фотографий в backend через `multipart/form-data`.

## Upload flow
1. Камера возвращает локальный файл.
2. App создает upload task.
3. Файл при необходимости сжимается.
4. API client отправляет `POST /api/v1/photos`.
5. UI показывает progress.
6. Backend возвращает `photoId`.
7. Следующий бизнес-запрос использует `photoId`.

## Очередь
Upload queue хранит:
- local file path;
- photo type;
- related ids;
- retry count;
- status;
- created at.

## Progress
UI показывает:
- Uploading photo;
- процент, если доступен;
- Retry при ошибке;
- Disabled action, если фото обязательно и не загружено.

## Повтор
Retry разрешен для сетевых ошибок и `PHOTO_UPLOAD_FAILED`. Если backend вернул `PHOTO_VALIDATION_FAILED`, пользователь должен переснять или выбрать другое фото.

## Сжатие
Сжатие выполняется до upload. App сохраняет достаточное качество для аудита. Оригинал может храниться временно до успешной загрузки.

## Ошибки
- нет сети;
- timeout;
- unsupported media type;
- file too large;
- validation failed;
- auth expired.

## Offline
Если сеть недоступна, upload task остается в очереди. Действия, которые требуют немедленного фото-подтверждения, остаются в pending state до успешной синхронизации.

## Ограничение
Frontend не должен считать этап завершенным до ответа backend.
