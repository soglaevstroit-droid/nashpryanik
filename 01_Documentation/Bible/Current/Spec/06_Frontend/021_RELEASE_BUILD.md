# 021 — Release Build

## Назначение
Документ описывает debug, stage, production сборки и build pipeline Flutter-приложения.

## Flavors
- `debug` — локальная разработка.
- `stage` — тестовое окружение.
- `production` — рабочее окружение.

## Конфигурация
Каждая сборка имеет:
- API base URL;
- storage URL policy;
- push config;
- logging level;
- feature flags, если они описаны документацией.

## Debug
Допускает расширенные logs, mock API и dev tools. Не используется для production.

## Stage
Используется для приемки:
- реальные API contracts;
- тестовая БД;
- production-like auth;
- проверка push и upload.

## Production
Требует:
- minified/release build;
- отключенные debug logs;
- secure storage;
- crash reporting;
- production API URL;
- проверенные permissions.

## Pipeline
Шаги:
1. install dependencies;
2. static analysis;
3. unit tests;
4. widget tests;
5. golden tests;
6. integration smoke;
7. build artifact;
8. signing;
9. release notes.

## Запрет
Release build не должен содержать test tokens, debug endpoints и secrets в коде.
