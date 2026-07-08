# ENGINEERING START AUDIT — СТРОИТ.РФ

Версия: 1.0

Дата аудита: 2026-07-08

Статус: завершено

---

## 1. Назначение

Документ фиксирует техническую готовность проекта СТРОИТ.РФ к переходу от документации к инженерной реализации.

Аудит не меняет утвержденные документы, философию, роли, Event Bible, Rule Bible, стек или архитектурные решения. Все найденные замечания зафиксированы как входные ограничения для следующей инженерной задачи.

## 2. Общий статус готовности

Общий статус: **частично готов к инженерному старту**.

Проект имеет достаточную основу для начала `TASK_026_REPOSITORY_FOUNDATION`, если эта задача будет ограничена подготовкой репозитория, фиксацией структуры, выбором единого источника истины и устранением технических расхождений документации. Начинать разработку прикладного кода MVP до закрытия блокирующих замечаний рискованно.

Ключевой вывод:

- фундамент СТРОИТ.РФ сформирован и утвержден;
- MVP Vertical Slice описывает первый рабочий сценарий;
- Tech Stack и Infrastructure Master Plan задают современный инженерный контур;
- Rule Bible, Process Bible и Event Bible начаты, но не полностью покрывают структуру, заявленную в MASTER_BIBLE_STRUCTURE;
- в документации одновременно присутствуют два слоя проекта: новый слой СТРОИТ.РФ и ранее созданный слой НАШПРЯНИК.РФ;
- часть новых фундаментальных документов существует в рабочем дереве, но еще не зафиксирована в git.

## 3. Проверенная область

Проверены:

- `FOUNDATION.md`
- `VERSION_1_FOUNDATION.md`
- `MASTER_BIBLE_STRUCTURE.md`
- `MASTER_AUDIT.md`
- `HUMAN_BIBLE.md`
- `06_Rule_Bible/`
- `08_Process_Bible/`
- `09_Event_Bible/`
- `TECH_STACK_DECISION.md`
- `DEVELOPMENT_RULES.md`
- `INFRASTRUCTURE_MASTER_PLAN.md`
- `MVP_VERTICAL_SLICE.md`
- существующие Product, UI, Architecture, Design System, Database, API, Backend и Frontend Bible
- `AUDIT_REPORT.md`
- `MASTER_DEVELOPMENT_ROADMAP.md`

## 4. Проверка структуры документации

Фактическая структура содержит основные инженерные разделы:

- `00_Project`
- `01_UI_Bible`
- `02_Architecture`
- `02_Design_System`
- `03_Database`
- `04_API`
- `05_Backend`
- `06_Frontend`
- `06_Rule_Bible`
- `08_Process_Bible`
- `09_Event_Bible`
- `10_Codex`
- корневые master-документы спецификации

Структура достаточна для аудита и постановки следующей repository foundation задачи.

Структура еще не полностью соответствует `MASTER_BIBLE_STRUCTURE.md`, потому что часть заявленных разделов и файлов отсутствует или представлена неполно.

## 5. Проверка ключевых файлов

Все ключевые файлы, перечисленные в задаче, физически существуют:

- `FOUNDATION.md`
- `VERSION_1_FOUNDATION.md`
- `MASTER_BIBLE_STRUCTURE.md`
- `MASTER_AUDIT.md`
- `HUMAN_BIBLE.md`
- `TECH_STACK_DECISION.md`
- `DEVELOPMENT_RULES.md`
- `INFRASTRUCTURE_MASTER_PLAN.md`
- `MVP_VERTICAL_SLICE.md`

Ключевые папки существуют:

- `06_Rule_Bible/`
- `08_Process_Bible/`
- `09_Event_Bible/`

## 6. Проверка пустых файлов и шаблонных маркеров

Результат проверки:

- пустые Markdown-файлы в целевой документации не найдены;
- запрещенные шаблонные маркеры в целевой документации не найдены;
- документы Codex-задач не учитывались как продуктовая документация.

## 7. Готовые документы

### Foundation

Статус: готов.

`FOUNDATION.md` задает миссию, принцип человека как главной ценности, событие как основу памяти компании, роль AI как помощника и главный критерий полезности решения.

### Version 1 Foundation

Статус: готов как символический lock фундамента.

`VERSION_1_FOUNDATION.md` фиксирует завершение первого этапа проектирования и переход к инженерному этапу.

Замечание: дата утверждения содержит незаполненное поле, но документ явно имеет статус `APPROVED` и `FOUNDATION LOCKED`.

### Human Bible

Статус: готов как философско-ролевой документ.

`HUMAN_BIBLE.md` описывает роли и ожидания людей: Создатель, Руководитель, Финансист, Прораб, Монтажник, Партнер и AI-помощник.

Инженерное ограничение: для MVP-разработки необходимо отделять операционные роли продукта от стратегических и внешних ролей. Операционные роли MVP остаются монтажник, прораб, финансист и руководительская роль без отдельного набора MVP-экранов, если иное не будет утверждено отдельным документом.

### Rule Bible

Статус: частично готов.

`06_Rule_Bible/000_RULE_PHILOSOPHY.md` задает философию правил: код не создает правила, код их реализует; правила должны защищать человека, компанию, качество, доверие, историю и справедливость.

Ограничение: на текущий момент описана философия правил, но не полный каталог прикладных правил.

### Process Bible

Статус: частично готов.

Готовы:

- `000_PROCESS_PHILOSOPHY.md`
- `001_COMPANY_OPERATING_SYSTEM.md`
- `002_WORK_DAY.md`

Эти документы согласуются с Foundation и Human Bible: процессы должны помогать человеку, уменьшать хаос, оставлять цифровой след и развивать компанию.

Ограничение: в `MASTER_BIBLE_STRUCTURE.md` заявлены дополнительные process-документы, которые пока отсутствуют.

### Event Bible

Статус: частично готов.

Готовы:

- `000_EVENT_PHILOSOPHY.md`
- `001_EVENT_TYPES.md`

Документы согласуются с Foundation: событие является атомом памяти компании, каждое значимое действие должно создавать событие, AI и аналитика используют историю.

Ограничение: в `MASTER_BIBLE_STRUCTURE.md` заявлены дополнительные event-документы, которые пока отсутствуют.

### MVP Vertical Slice

Статус: готов как первый инженерный сценарий.

`MVP_VERTICAL_SLICE.md` описывает полный путь: монтажник → задача → этап → фото → история → монеты → контроль прораба → проверка финансиста.

Документ можно использовать как главный сценарий для первой реализации после repository foundation.

### Tech Stack

Статус: готов как утвержденное технологическое решение.

`TECH_STACK_DECISION.md` утверждает:

- Flutter;
- NestJS;
- TypeScript;
- PostgreSQL;
- Prisma ORM;
- JWT, refresh token, RBAC;
- MinIO;
- Redis;
- BullMQ;
- Nginx;
- Docker и Docker Compose;
- GitHub Actions;
- REST API `/api/v1`;
- Swagger OpenAPI;
- Clean Architecture, Repository Pattern, Service Layer и Dependency Injection.

### Infrastructure

Статус: готов как high-level infrastructure plan.

`INFRASTRUCTURE_MASTER_PLAN.md` описывает MVP на одном VPS с Docker Compose, PostgreSQL, Redis, MinIO, Nginx, SSL, backup, monitoring и правилами масштабирования.

### Development Rules

Статус: готов.

`DEVELOPMENT_RULES.md` задает Git Flow, формат коммитов, code review, naming, документационные правила, testing и Definition of Done.

## 8. Документы, требующие доработки

### MASTER_AUDIT.md

Статус: требует завершения.

Документ имеет статус `IN PROGRESS` и содержит незакрытые чек-пункты по Foundation, Human, Process, Event, Database, API, Backend, Frontend, AI, Knowledge и MVP. Для engineering start это не ломает repository foundation, но блокирует уверенный старт прикладной разработки без дополнительных решений.

### MASTER_DEVELOPMENT_ROADMAP.md

Статус: требует согласования с новым стеком и новым названием проекта.

Документ был создан до появления нового слоя СТРОИТ.РФ и опирается на прежнее название проекта. Также он описывает Express backend, тогда как `TECH_STACK_DECISION.md` утверждает NestJS и TypeScript.

### Backend Bible

Статус: требует технического согласования со стеком.

`05_Backend` описывает backend как реализацию REST API с сервисами и репозиториями, но текущий утвержденный стек требует NestJS, TypeScript, Prisma ORM и Dependency Injection. Сервисная архитектура совместима по смыслу, но конкретная backend foundation задача должна выбрать реализацию по `TECH_STACK_DECISION.md`.

### UI/Product Bible прежнего слоя

Статус: требует терминологического решения.

В существующих Product, UI, Architecture, Database, API, Backend и Frontend Bible широко используется название НАШПРЯНИК.РФ, тогда как TASK_025, Foundation, Human Bible, Process Bible, Event Bible, Tech Stack и Infrastructure используют СТРОИТ.РФ.

Смысл сценариев строительства в целом совместим, но перед кодом нужно определить, является ли СТРОИТ.РФ переименованием проекта или новым верхним названием над прежним комплектом.

## 9. Отсутствующие документы

Файлы, перечисленные в TASK_025 как главные, существуют.

Относительно `MASTER_BIBLE_STRUCTURE.md` отсутствуют или не представлены в текущей структуре:

- `MISSION.md`
- `VALUES.md`
- `PRINCIPLES.md`
- отдельный `PROCESS_BIBLE.md`
- отдельный `EVENT_BIBLE.md`
- раздел `07_Role_Bible` с отдельными документами ролей;
- `08_Process_Bible/003_SHIFT_LIFECYCLE.md`
- `08_Process_Bible/004_TASK_LIFECYCLE.md`
- `08_Process_Bible/005_STEP_LIFECYCLE.md`
- `08_Process_Bible/006_PHOTO_PROCESS.md`
- `08_Process_Bible/007_ACCEPTANCE_PROCESS.md`
- `08_Process_Bible/008_FINANCE_PROCESS.md`
- `08_Process_Bible/009_AI_PROCESS.md`
- `08_Process_Bible/010_CONTINUOUS_IMPROVEMENT.md`
- `09_Event_Bible/002_EVENT_ARTIFACTS.md`
- `09_Event_Bible/003_EVENT_FIELDS.md`
- `09_Event_Bible/004_EVENT_LIFECYCLE.md`
- `09_Event_Bible/005_EVENT_STORE.md`
- `09_Event_Bible/006_EVENT_VERSIONING.md`
- раздел `10_Knowledge_Bible`;
- инфраструктурные документы `DEPLOYMENT.md`, `BACKUP.md`, `MONITORING.md`;
- release-документы `FIRST_RELEASE_CHECKLIST.md`, `TESTING_STRATEGY.md`, `SECURITY_CHECKLIST.md`, `MVP_RELEASE.md`, `PRODUCTION_READINESS.md`.

Не все эти документы обязаны быть готовы до `TASK_026_REPOSITORY_FOUNDATION`, но process lifecycle, event fields, event lifecycle, event store, deployment, backup и monitoring нужны до полноценной реализации прикладного кода.

## 10. Найденные противоречия

### Название проекта

Новый фундаментальный слой использует СТРОИТ.РФ. Ранее созданный инженерный Bible-комплект использует НАШПРЯНИК.РФ.

Риск: код, домены, package names, app display name, API title, OpenAPI title и release artifacts могут получить разные названия.

Рекомендация: в `TASK_026_REPOSITORY_FOUNDATION` зафиксировать единое engineering name policy без переписывания философии.

### Backend stack

`TECH_STACK_DECISION.md` утверждает NestJS, TypeScript и Prisma ORM. Ранее созданные roadmap и часть backend/UI index документов упоминают Express.

Риск: repository foundation может быть создан на неверном backend-фреймворке.

Рекомендация: считать `TECH_STACK_DECISION.md` приоритетным для нового инженерного старта, а прежние Express-упоминания пометить как документы, требующие последующего согласования.

### Event model против текущей Database/API модели

Event Bible говорит, что каждое значимое действие является событием и события не изменяются. Текущая Database Bible содержит `audit_log`, доменные таблицы и историю, но не описывает полноценный event store как отдельный механизм.

Риск: backend может реализовать только аудит, не сохранив event-driven память компании в том виде, который задает Event Bible.

Рекомендация: до реализации Task Engine описать event store boundary: какие события пишутся как append-only events, как они связаны с audit log и доменными таблицами.

### Роли Human Bible и MVP-роли

Human Bible описывает Создателя, Партнера и AI-помощника как важные роли системы. MVP Vertical Slice и прежняя инженерная документация ограничивают первый рабочий сценарий монтажником, прорабом и финансистом, с руководительской ролью без отдельного MVP UI.

Риск: разработка может попытаться создать лишние интерфейсы до подтверждения MVP-объема.

Рекомендация: для MVP считать операционными только роли, требуемые vertical slice, а стратегические и внешние роли оставить в фундаменте без реализации отдельных экранов.

### Инфраструктурный admin-домен

Infrastructure Master Plan содержит `admin.строит.рф` и сервис `admin`, но ранее Frontend Bible фиксировал, что отдельный admin UI не реализуется без фундаментального обоснования роли.

Риск: infrastructure foundation может создать admin-приложение как фактическую новую роль.

Рекомендация: в TASK_026 разрешить только инфраструктурный reserved domain/service name без реализации admin role, прав или UI.

### Git state

На момент аудита рабочее дерево содержит незакоммиченные документы нового фундаментального слоя. Это не содержательное противоречие, но это инженерный риск.

Риск: TASK_026 может стартовать от состояния, которое не воспроизводится из git.

Рекомендация: перед началом прикладного кода зафиксировать или осознанно вынести эти документы отдельным коммитом после проверки владельцем документации.

## 11. Риски перед началом разработки

1. Риск неправильного backend foundation из-за расхождения Express и NestJS.
2. Риск смешения брендов СТРОИТ.РФ и НАШПРЯНИК.РФ в коде, доменах и артефактах.
3. Риск неполной событийной архитектуры, если event store не будет описан до task/photo/coin engine.
4. Риск расширения MVP ролями Создателя, Партнера или admin UI без отдельного решения.
5. Риск потери воспроизводимости из-за незакоммиченных фундаментальных документов.
6. Риск разработки process logic по догадкам, потому что часть lifecycle-документов Process Bible отсутствует.
7. Риск инфраструктурных пробелов, если deployment, backup и monitoring будут реализованы только по high-level плану без отдельных runbook-документов.

## 12. Что нужно сделать следующим шагом

Следующий шаг: **можно начинать `TASK_026_REPOSITORY_FOUNDATION` только как задачу инженерной стабилизации репозитория**.

В `TASK_026_REPOSITORY_FOUNDATION` нужно:

1. Зафиксировать, что `TECH_STACK_DECISION.md` имеет приоритет для нового backend foundation.
2. Создать структуру репозитория под Flutter, NestJS, PostgreSQL, Prisma, MinIO, Redis, BullMQ, Nginx и Docker Compose.
3. Не писать прикладную бизнес-логику.
4. Не создавать новые роли.
5. Не реализовывать admin UI.
6. Зафиксировать naming policy для СТРОИТ.РФ и связь с прежним Bible-комплектом.
7. Зафиксировать, какие незакоммиченные документы должны быть добавлены в git до начала feature-разработки.
8. Отдельно поставить следующие documentation tasks: process lifecycle pack, event store pack, deployment runbook, backup runbook, monitoring runbook.

## 13. Решение по TASK_026_REPOSITORY_FOUNDATION

`TASK_026_REPOSITORY_FOUNDATION` начинать можно.

Ограничение: задача должна быть repository/infrastructure foundation, а не началом разработки приложения.

Запрещено в рамках TASK_026:

- реализовывать task engine;
- реализовывать photo engine;
- реализовывать coin engine;
- создавать UI-экраны;
- создавать admin role или admin UI;
- менять Event Bible или Rule Bible;
- переписывать утвержденную философию.

Разрешено в рамках TASK_026:

- создать техническую структуру репозитория;
- подготовить package/workspace skeleton;
- подготовить Docker Compose skeleton;
- подготовить env example без секретов;
- подготовить lint/test/build команды;
- подготовить Prisma/NestJS/Flutter foundation без доменной логики;
- зафиксировать инженерные ограничения из этого аудита.

## 14. Итог

Проект СТРОИТ.РФ готов к аккуратному началу инженерного этапа через `TASK_026_REPOSITORY_FOUNDATION`.

Проект не готов к немедленной реализации прикладного MVP-кода до закрытия решений по названию, backend stack precedence, event store boundary, отсутствующим lifecycle-документам и git-state новых фундаментальных документов.
