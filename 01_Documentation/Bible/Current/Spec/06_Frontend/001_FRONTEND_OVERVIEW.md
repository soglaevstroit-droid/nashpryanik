# 001 — Frontend Overview

## Назначение
Документ описывает архитектуру Flutter mobile-приложения. Приложение обслуживает роли монтажника, прораба, финансиста и руководительскую аналитику в рамках существующих источников истины.

## Mobile First
Все интерфейсы проектируются сначала под iPhone. Композиция, размер элементов, состояния загрузки и ошибки должны работать на узком экране без горизонтального скролла.

## Feature-first architecture
Код группируется по функциональным областям:
- auth;
- worker;
- foreman;
- finance;
- tasks;
- work sessions;
- photos;
- notifications;
- shared analytics.

Feature содержит UI, state, repository adapter и модели, относящиеся к экранному сценарию.

## Clean Architecture
Рекомендуемая структура слоя feature:

```text
presentation → application → domain → data
```

- `presentation` — Flutter widgets и screens.
- `application` — ViewModel/BLoC и orchestration UI state.
- `domain` — сущности и use cases.
- `data` — API client, local cache, DTO mapping.

## MVVM / BLoC подход
Для управления состоянием используется MVVM/BLoC-подход:
- экран подписан на state;
- ViewModel/BLoC вызывает use case;
- use case вызывает repository;
- repository работает с API client и local storage;
- UI не вызывает backend напрямую.

## Работа с API
Все сетевые запросы идут через общий API client:
- base URL `/api/v1`;
- JWT access token;
- refresh token;
- timeout;
- retry для безопасных запросов;
- единый error mapping из API Bible.

## Локальное хранилище
Локально хранятся:
- access token краткосрочно в безопасном storage;
- refresh token в secure storage;
- кэш экранных данных;
- очередь offline-действий;
- настройки интерфейса, если они не противоречат backend.

## Синхронизация
Offline queue используется для действий, которые можно безопасно повторить:
- загрузка фото после временной ошибки;
- повтор отправки подтверждения, если backend не принял запрос;
- обновление статуса уведомления.

Финансовые решения не должны silently повторяться без контроля idempotency и обработки конфликтов.

## Архитектурные ограничения
- Frontend не начисляет монеты.
- Frontend не утверждает выплату без backend.
- Frontend не принимает AI-рекомендацию автоматически.
- Frontend не показывает роль или экран, не разрешенные backend.
- Frontend не меняет Design System.
