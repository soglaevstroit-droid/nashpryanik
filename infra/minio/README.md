# infra/minio

Назначение: будущая инфраструктурная зона MinIO для файлового хранилища.

Источник истины:

- `TECH_STACK_DECISION.md`
- `INFRASTRUCTURE_MASTER_PLAN.md`
- `03_Database/009_TABLE_PHOTOS.md`
- `05_Backend/009_FILE_STORAGE.md`

MinIO используется как S3-compatible storage для фотографий и файловых вложений. PostgreSQL хранит метаданные и ссылки, а не бинарные файлы в бизнес-таблицах.

На Sprint 001 здесь создается только место для инфраструктурных материалов MinIO. Buckets, credentials, policies и runtime-конфигурация не создаются.
