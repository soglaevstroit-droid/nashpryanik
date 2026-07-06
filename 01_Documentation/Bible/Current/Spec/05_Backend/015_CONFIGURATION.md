# 015 — Configuration

## Назначение
Документ описывает конфигурацию backend и переменные окружения. Конфигурация не должна храниться в коде.

## Окружения
- `development`;
- `test`;
- `staging`;
- `production`.

## Основные переменные

```text
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
JWT_ACCESS_TTL=3600
JWT_REFRESH_TTL=2592000
STORAGE_PROVIDER=s3
STORAGE_BUCKET=...
STORAGE_REGION=...
AI_ENDPOINT=...
AI_API_KEY=...
RATE_LIMIT_ENABLED=true
LOG_LEVEL=info
```

## Secrets
Secrets хранятся в защищенном хранилище окружения и не попадают в git.

К secret относятся:
- JWT secrets;
- database password;
- storage credentials;
- AI API key;
- email/push credentials.

## Конфигурация БД
Backend использует PostgreSQL. Пул соединений настраивается отдельно для окружений.

## Конфигурация storage
Storage config должен поддерживать:
- provider;
- bucket;
- region;
- signed URL TTL;
- max file size;
- allowed MIME types.

## Конфигурация AI
AI может быть отключен в окружении. Если AI недоступен, backend возвращает ошибку AI для соответствующего endpoint, но рабочие сценарии задач и смен продолжают работать.

## Валидация конфигурации
При старте backend проверяет обязательные переменные. Если отсутствует критичный secret или database URL, приложение не должно запускаться.
