# СТРОИТ.РФ — Development Platform

Инженерная платформа проекта СТРОИТ.РФ.

Этот репозиторий подготовлен для разработки без прикладного кода приложения. На текущем этапе поднимаются только инфраструктурные сервисы: PostgreSQL, Redis и MinIO.

## Быстрый старт

```bash
make up
```

Команда использует `.env`, если файл существует. Если `.env` еще не создан, используются безопасные значения из `.env.example`.

## Остановить сервисы

```bash
make down
```

## Посмотреть логи

```bash
make logs
```

## Проверить статус

```bash
make status
```

## Сбросить окружение

```bash
make reset
```

Команда останавливает сервисы, удаляет volumes и запускает их заново.

## Полная очистка

```bash
make clean
```

Команда останавливает контейнеры и удаляет volumes.

## Healthcheck

```bash
./scripts/healthcheck.sh
```

Проверяет доступность контейнеров PostgreSQL, Redis и MinIO через Docker Compose.

## Структура проекта

```text
apps/
  backend/    NestJS/TypeScript backend skeleton без бизнес-логики
  mobile/     Flutter mobile skeleton без экранов и логики
  admin/      зарезервированное место без admin role и admin UI

packages/
  shared/         будущие общие типы и утилиты
  api_client/     будущий REST API client
  design_system/  будущая техническая упаковка Design System

infra/
  docker/    Docker Compose для локальных сервисов
  nginx/     будущая reverse proxy конфигурация
  postgres/  инфраструктура PostgreSQL
  redis/     инфраструктура Redis
  minio/     инфраструктура MinIO

scripts/     вспомогательные команды разработки
docs/        инженерные runbook и ADR
```

## Источники истины

- `01_Documentation/Bible/Current/Spec/FOUNDATION.md`
- `01_Documentation/Bible/Current/Spec/VERSION_1_FOUNDATION.md`
- `01_Documentation/Bible/Current/Spec/MASTER_BIBLE_STRUCTURE.md`
- `01_Documentation/Bible/Current/Spec/ENGINEERING_ROADMAP.md`
- `01_Documentation/Bible/Current/Spec/DEVELOPMENT_RULES.md`
- `01_Documentation/Bible/Current/Spec/TECH_STACK_DECISION.md`
- `01_Documentation/Bible/Current/Spec/INFRASTRUCTURE_MASTER_PLAN.md`

## Ограничения текущего этапа

- backend-код приложения не реализован;
- API не реализован;
- модели данных и Prisma schema не созданы;
- Event Engine и Process Engine не реализованы;
- Flutter-экраны не созданы;
- admin role и admin UI не создаются.
