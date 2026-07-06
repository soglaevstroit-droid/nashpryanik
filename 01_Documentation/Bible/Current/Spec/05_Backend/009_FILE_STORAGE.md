# 009 — File Storage

## Назначение
Документ описывает хранение фотографий, которые подтверждают ключевые действия. Backend хранит файлы во внешнем storage, а PostgreSQL хранит метаданные в таблице `photos`.

## Upload flow
1. Клиент отправляет `POST /api/v1/photos` как `multipart/form-data`.
2. Middleware проверяет размер и тип файла.
3. `PhotoService` сохраняет временный файл.
4. Storage client загружает файл в постоянное хранилище.
5. `PhotoRepository` создает запись `photos`.
6. Сервис возвращает `photoId` и URL.

## Metadata
В `photos` сохраняется:
- `company_id`;
- `uploaded_by`;
- `object_id`;
- `task_id`;
- `step_id`;
- `work_session_id`;
- `photo_type`;
- `status`;
- `storage_key`;
- `mime_type`;
- `size_bytes`;
- `checksum`.

## Storage Strategy
Ключ storage строится так, чтобы поддерживать масштабирование:

```text
companies/{companyId}/photos/{yyyy}/{mm}/{photoId}.jpg
```

Бизнес-смысл не хранится только в пути файла. Источник правды — metadata в PostgreSQL.

## Thumbnail
Backend может создавать thumbnail для ускорения UI. Thumbnail не заменяет оригинал.

Metadata thumbnail хранится в `photos` как дополнительное поле или в связанной storage metadata, если это будет описано в Database Bible.

## Compression
Сжатие допустимо для рабочих копий. Оригинал или достаточная для аудита версия должны сохраняться согласно политике storage.

## Validation
Проверяется:
- тип файла;
- размер;
- наличие required metadata;
- доступ пользователя к связанной сущности;
- соответствие `photo_type` сценарию.

## Cleanup
Временные файлы удаляются background job. Если storage upload прошел, а запись БД не создана, job должен обнаружить orphan object и удалить или пометить его.

## Security
- URL просмотра должен быть защищен JWT или signed URL.
- Пользователь не может получить фото другой компании.
- Файлы не должны исполняться сервером.
- MIME type проверяется backend.

## Связь с UI и API
- `008_PHOTOS_API.md`.
- `003_Start_Work_Camera`.
- `008_Step_Confirm`.
- `010_Cannot_Do`.
- `022_System_Photo_Uploading`.
