# infra/minio

Назначение: инфраструктурная зона MinIO для файлового хранилища.

Источник истины:

- `TECH_STACK_DECISION.md`
- `INFRASTRUCTURE_MASTER_PLAN.md`
- `03_Database/009_TABLE_PHOTOS.md`
- `05_Backend/009_FILE_STORAGE.md`

MinIO используется как S3-compatible storage для фотографий и файловых вложений. PostgreSQL хранит метаданные и ссылки, а не бинарные файлы в бизнес-таблицах.

Photo Artifact foundation использует bucket из `MINIO_DEFAULT_BUCKET`. Backend создает bucket при первой загрузке фото, если он еще не существует.

Policies, lifecycle rules, versioning и production hardening не создаются на этом этапе.
