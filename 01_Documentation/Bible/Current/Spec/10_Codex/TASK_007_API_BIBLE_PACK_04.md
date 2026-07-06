# TASK 007 — API Bible Pack 04

## Branch

documentation

---

# Цель

Создать полный пакет API-документации проекта.

Работать только в:

01_Documentation/Bible/Current/Spec/04_API/

Не изменять существующие документы.

Использовать как источник истины:

- 00_Project
- 01_UI_Bible
- 02_Architecture
- 03_Database
- Design System
- MASTER_PROMPT.md

---

# Создать структуру

04_API/

README.md

001_API_OVERVIEW.md

002_AUTH_API.md

003_USERS_API.md

004_OBJECTS_API.md

005_TASKS_API.md

006_TASK_STEPS_API.md

007_WORK_SESSIONS_API.md

008_PHOTOS_API.md

009_COINS_API.md

010_FINANCE_API.md

011_AI_RECOMMENDATIONS_API.md

012_NOTIFICATIONS_API.md

013_ERRORS.md

014_PERMISSIONS.md

015_RATE_LIMITS.md

016_API_VERSIONING.md

017_OPENAPI_STRUCTURE.md

---

# Требования

Для каждого API-документа описать:

- назначение;
- endpoints;
- method;
- request body;
- response body;
- ошибки;
- права доступа;
- связь с таблицами БД;
- связь с UI-экранами;
- примеры JSON.

---

# Особые правила

- Использовать REST API.
- Все endpoints начинать с `/api/v1`.
- Ошибки возвращать в едином формате.
- ИИ только рекомендует, не утверждает выплаты.
- Фото загружаются через multipart/form-data.
- Финансовые действия должны иметь audit log.
- Не придумывать новую бизнес-логику.

---

# Definition of Done

Созданы все документы.

Все документы полностью заполнены.

Рабочее дерево чистое.

Git commit выполнен.

После завершения вывести:

- commit hash;
- количество созданных файлов;
- краткую сводку.