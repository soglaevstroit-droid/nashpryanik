# 06 Frontend

## Назначение
Frontend Bible описывает Flutter mobile-приложение НАШПРЯНИК.РФ. Раздел фиксирует архитектуру, структуру проекта, навигацию, state management, API client, auth, компоненты, формы, камеру, загрузку фото, offline-режим, уведомления, производительность, тестирование, release build и масштабирование.

Frontend не вводит новую бизнес-логику. Он реализует UI Bible, Design System, REST API `/api/v1`, Backend Bible и PostgreSQL-модель через утвержденные контракты.

## Документы
- `001_FRONTEND_OVERVIEW.md` — архитектура Flutter-приложения.
- `002_PROJECT_STRUCTURE.md` — структура каталогов.
- `003_NAVIGATION.md` — навигация по ролям и экранам UI Bible.
- `004_ROUTING.md` — маршруты, protected routes и role routing.
- `005_STATE_MANAGEMENT.md` — управление состоянием.
- `006_API_CLIENT.md` — интеграция с backend API.
- `007_AUTHENTICATION.md` — login, logout, refresh, session.
- `008_COMPONENTS.md` — переиспользуемые компоненты.
- `009_FORMS.md` — формы и валидация.
- `010_CAMERA.md` — камера.
- `011_PHOTO_UPLOAD.md` — загрузка фотографий.
- `012_OFFLINE_MODE.md` — работа без интернета.
- `013_ERROR_HANDLING.md` — обработка ошибок.
- `014_LOADING_STATES.md` — загрузки, skeleton, retry.
- `015_DESIGN_SYSTEM_USAGE.md` — применение Design System.
- `016_ROLE_BASED_UI.md` — UI по ролям.
- `017_LOCAL_STORAGE.md` — локальное хранение.
- `018_NOTIFICATIONS.md` — уведомления.
- `019_PERFORMANCE.md` — производительность.
- `020_TESTING.md` — тестирование.
- `021_RELEASE_BUILD.md` — сборки.
- `022_SCALABILITY.md` — масштабирование приложения.

## Главные правила
- Все экраны mobile first.
- Design System не изменяется.
- UI повторяет утвержденные референсы минимум на 95%.
- Backend проверяет бизнес-логику, frontend не обходит API.
- ИИ рекомендует, человек утверждает.
