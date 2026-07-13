import type { TaskAccessStatus, TaskPriority, TaskStatus, TaskStepStatus } from '@prisma/client';

export const EXTENDED_TESTDATA_MARKER = 'EXT_TEST_V1';
export const EXTENDED_TESTDATA_PASSWORD = '12344321';

export function assertExtendedExecutionEnvironment(input: {
  environment: string;
  databaseUrl: string;
  minioHost: string;
  productionAuthorized?: boolean;
}): void {
  const url = new URL(input.databaseUrl);
  const localHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const localMinio = input.minioHost === 'localhost' || input.minioHost === '127.0.0.1';
  if (input.productionAuthorized) {
    if (input.environment !== 'production' || !localHost || !localMinio)
      throw new Error('Confirmed production testdata requires loopback DB and MinIO.');
    return;
  }
  if (
    input.environment === 'production' ||
    !localHost ||
    !localMinio ||
    !url.pathname.toLowerCase().includes('dev')
  )
    throw new Error('Extended testdata is allowed only in a local development environment.');
}

export const extendedTestUsers = [
  { email: 'work', name: 'Монтажник', role: 'WORKER' },
  { email: 'work2', name: 'Руководитель', role: 'FOREMAN' },
  { email: 'work3', name: 'Аналитик', role: 'ANALYST' },
] as const;

export const extendedTestObjects = [
  { key: 'pryanik', name: 'Пряник', slug: 'ext-test-pryanik', sortOrder: 101 },
  { key: 'baumanka', name: 'Бауманка', slug: 'ext-test-baumanka', sortOrder: 102 },
  { key: 'yakimanka', name: 'Якиманка', slug: 'ext-test-yakimanka', sortOrder: 103 },
  {
    key: 'north',
    name: 'Северный корпус',
    slug: 'ext-test-severny-korpus',
    sortOrder: 104,
  },
  {
    key: 'long',
    name: 'Многофункциональный административно-общественный комплекс с техническими помещениями',
    slug: 'ext-test-long-object',
    sortOrder: 105,
  },
] as const;

export interface ExtendedStepSpec {
  title: string;
  description: string;
  status?: TaskStepStatus;
  photoCount?: number;
  deleted?: boolean;
}

export interface ExtendedTaskSpec {
  number: number;
  title: string;
  description?: string;
  objectKey: (typeof extendedTestObjects)[number]['key'];
  location: string;
  status: TaskStatus;
  priority: TaskPriority;
  accessStatus: TaskAccessStatus;
  position: number;
  referencePhotos: number;
  steps: ExtendedStepSpec[];
  deleted?: boolean;
  blocked?: boolean;
}

const step = (title: string, description?: string): ExtendedStepSpec => ({
  title,
  description:
    description ??
    `Выполнить работы «${title.toLowerCase()}» по проекту и зафиксировать результат.`,
});

const longDescription =
  'Выполнить полный комплекс работ по монтажу инженерных систем помещения: проверить актуальность рабочей документации, согласовать спорные узлы с руководителем, обеспечить защиту чистовой отделки и соблюдать требования охраны труда. До скрытия кабельных линий выполнить промежуточную фотофиксацию, промаркировать трассы и оборудование, проверить соответствие спецификации и записать результаты измерений. Все отклонения от проекта предварительно согласовывать. После монтажа провести функциональное тестирование, устранить замечания, убрать рабочую зону и передать помещение ответственному представителю с комплектом фотографий до и после выполнения работ.';

const longSteps = [
  'Осмотреть помещение и входные условия',
  'Проверить актуальную рабочую документацию',
  'Согласовать спорные технические решения',
  'Защитить чистовую отделку',
  'Выполнить инструментальную разметку',
  'Подготовить проходки и монтажные зоны',
  'Установить несущие крепления',
  'Смонтировать кабельные лотки',
  'Проложить силовые кабельные линии',
  'Проложить слаботочные кабельные линии',
  'Выполнить промежуточную фотофиксацию',
  'Установить оконечное оборудование',
  'Промаркировать кабели и оборудование',
  'Выполнить электрические подключения',
  'Проверить целостность и параметры линий',
  'Провести функциональное тестирование',
  'Устранить выявленные замечания',
  'Выполнить итоговую фотофиксацию',
  'Убрать рабочую зону',
  'Передать помещение ответственному представителю',
].map((title, index) =>
  step(
    title,
    `Этап ${index + 1} из 20. ${title}. Сверить результат с проектом, не скрывать отклонения и приложить фотофиксацию там, где она требуется регламентом.`,
  ),
);

export const extendedTaskSpecs: ExtendedTaskSpec[] = [
  {
    number: 1,
    title: 'Осмотреть рабочую зону',
    description: 'Проверить текущее состояние помещения и определить готовность к началу работ.',
    objectKey: 'pryanik',
    location: 'Этаж 3 / Пом. 301',
    status: 'ASSIGNED',
    priority: 'NORMAL',
    accessStatus: 'OPEN',
    position: 1,
    referencePhotos: 1,
    steps: [
      step(
        'Оценить состояние работ',
        'Проверить выполненные работы и определить оставшийся объём.',
      ),
    ],
  },
  {
    number: 2,
    title: 'Разметка',
    objectKey: 'baumanka',
    location: 'Этаж 2 / Коридор',
    status: 'ASSIGNED',
    priority: 'NORMAL',
    accessStatus: 'OPEN',
    position: 2,
    referencePhotos: 0,
    steps: [step('Проверить проект'), step('Нанести разметку')],
  },
  {
    number: 3,
    title:
      'Уточнить и согласовать расположение оконечного оборудования инженерных систем в помещении перед началом монтажных работ',
    description:
      'Согласовать с заказчиком расположение рабочих мест, с генеральным подрядчиком типы подсветки и освещения, с командой — размещение оконечного оборудования инженерных систем.',
    objectKey: 'pryanik',
    location: 'Этаж 3 / Пом. 314',
    status: 'ASSIGNED',
    priority: 'NORMAL',
    accessStatus: 'OPEN',
    position: 3,
    referencePhotos: 3,
    steps: [
      step('Уточнить технические решения'),
      step('Согласовать расположение рабочих мест'),
      step('Согласовать типы освещения'),
      step('Определить места установки оборудования'),
    ],
  },
  {
    number: 4,
    title: 'Восстановить питание аварийного освещения',
    description:
      'Найти причину отсутствия питания, восстановить линию и проверить работу аварийных светильников.',
    objectKey: 'yakimanka',
    location: 'Этаж 1 / Главный зал',
    status: 'ASSIGNED',
    priority: 'URGENT',
    accessStatus: 'OPEN',
    position: 4,
    referencePhotos: 2,
    steps: [
      step('Проверить линию питания'),
      step('Устранить неисправность'),
      step('Проверить освещение'),
    ],
  },
  {
    number: 5,
    title: 'Монтаж оборудования после согласования',
    objectKey: 'pryanik',
    location: 'Этаж 3 / Пом. 303',
    status: 'ASSIGNED',
    priority: 'NORMAL',
    accessStatus: 'CLOSED',
    position: 5,
    referencePhotos: 4,
    steps: [
      step('Проверить согласование'),
      step('Подготовить оборудование'),
      step('Выполнить монтаж'),
    ],
  },
  {
    number: 6,
    title: 'Подготовить скрытые подключения после разрешения доступа',
    objectKey: 'north',
    location: 'Техническое помещение Т-12',
    status: 'ASSIGNED',
    priority: 'URGENT',
    accessStatus: 'CLOSED',
    position: 6,
    referencePhotos: 2,
    steps: [step('Проверить разрешение доступа'), step('Подготовить скрытые подключения')],
  },
  {
    number: 7,
    title: 'Подготовить трассу для кабельных линий',
    objectKey: 'baumanka',
    location: 'Этаж 4 / Пом. 405',
    status: 'ACCEPTED',
    priority: 'NORMAL',
    accessStatus: 'OPEN',
    position: 7,
    referencePhotos: 2,
    steps: [
      step('Проверить проект трассы'),
      step('Разметить проходы'),
      step('Подготовить крепления'),
      step('Собрать трассу'),
      step('Проверить готовность'),
    ],
  },
  {
    number: 8,
    title: 'Смонтировать оконечное оборудование СКС',
    objectKey: 'pryanik',
    location: 'Этаж 3 / Пом. 311',
    status: 'IN_PROGRESS',
    priority: 'NORMAL',
    accessStatus: 'OPEN',
    position: 8,
    referencePhotos: 2,
    steps: [
      { ...step('Проверить кабельные линии'), status: 'COMPLETED', photoCount: 4 },
      { ...step('Установить розетки СКС'), status: 'IN_PROGRESS', photoCount: 2 },
      step('Промаркировать подключения'),
      step('Выполнить тестирование'),
      step('Убрать рабочую зону'),
    ],
  },
  {
    number: 9,
    title: 'Установить декоративную подсветку',
    objectKey: 'yakimanka',
    location: 'Главный зал / Стена А',
    status: 'PAUSED',
    priority: 'NORMAL',
    accessStatus: 'OPEN',
    position: 9,
    referencePhotos: 3,
    blocked: true,
    steps: [
      { ...step('Проверить образец светильника'), status: 'IN_PROGRESS' },
      step('Разметить точки установки'),
      step('Установить подсветку'),
      step('Проверить световую сцену'),
    ],
  },
  {
    number: 10,
    title: 'Смонтировать настенные светильники',
    objectKey: 'yakimanka',
    location: 'Коридор / Стены Б и В',
    status: 'IN_PROGRESS',
    priority: 'NORMAL',
    accessStatus: 'OPEN',
    position: 10,
    referencePhotos: 3,
    steps: [
      { ...step('Проверить отметки установки'), status: 'COMPLETED', photoCount: 2 },
      { ...step('Смонтировать светильники'), status: 'IN_PROGRESS' },
      step('Проверить включение'),
    ],
  },
  {
    number: 11,
    title: 'Подключить оборудование видеонаблюдения',
    objectKey: 'north',
    location: 'Серверная / Шкаф 2',
    status: 'PAUSED',
    priority: 'NORMAL',
    accessStatus: 'OPEN',
    position: 11,
    referencePhotos: 4,
    blocked: true,
    steps: [
      { ...step('Проверить оборудование'), status: 'IN_PROGRESS' },
      step('Установить оборудование'),
      step('Выполнить подключения'),
      step('Проверить запись'),
    ],
  },
  {
    number: 12,
    title: 'Выполнить полный комплекс монтажа инженерных систем помещения',
    description: longDescription,
    objectKey: 'long',
    location: 'Блок Б / Этаж 6 / Помещение переговорной группы № 6.14',
    status: 'ASSIGNED',
    priority: 'NORMAL',
    accessStatus: 'OPEN',
    position: 12,
    referencePhotos: 6,
    steps: longSteps,
  },
  {
    number: 13,
    title: 'Проверить загрузку фотографий высокого разрешения',
    objectKey: 'long',
    location: 'Фотофиксация / Тестовая зона',
    status: 'ASSIGNED',
    priority: 'NORMAL',
    accessStatus: 'OPEN',
    position: 13,
    referencePhotos: 8,
    steps: [
      step('Выбрать изображения'),
      step('Проверить предварительный просмотр'),
      step('Проверить сохранение'),
    ],
  },
  {
    number: 14,
    title: 'Тест максимального количества исходных фотографий',
    objectKey: 'north',
    location: 'Лаборатория / Фото-зона',
    status: 'ASSIGNED',
    priority: 'NORMAL',
    accessStatus: 'OPEN',
    position: 14,
    referencePhotos: 12,
    steps: [step('Проверить набор фотографий'), step('Проверить слайдер')],
  },
  {
    number: 15,
    title: 'Проверить фотофиксацию этапов',
    objectKey: 'baumanka',
    location: 'Этаж 5 / Тестовая зона',
    status: 'IN_PROGRESS',
    priority: 'NORMAL',
    accessStatus: 'OPEN',
    position: 15,
    referencePhotos: 0,
    steps: [
      { ...step('Подготовить зону'), status: 'COMPLETED', photoCount: 4 },
      { ...step('Выполнить монтаж'), status: 'IN_PROGRESS', photoCount: 1 },
      step('Проверить результат'),
    ],
  },
  {
    number: 16,
    title: 'Завершённый монтаж кабельных линий',
    objectKey: 'baumanka',
    location: 'Этаж 1 / Технический коридор',
    status: 'COMPLETED',
    priority: 'NORMAL',
    accessStatus: 'OPEN',
    position: 99,
    referencePhotos: 0,
    steps: [
      { ...step('Подготовить трассу'), status: 'COMPLETED', photoCount: 2 },
      { ...step('Проложить кабель'), status: 'COMPLETED', photoCount: 2 },
      { ...step('Промаркировать линии'), status: 'COMPLETED', photoCount: 2 },
      { ...step('Проверить линии'), status: 'COMPLETED', photoCount: 2 },
    ],
  },
  {
    number: 17,
    title: 'Ошибочно поставленная тестовая задача',
    objectKey: 'pryanik',
    location: 'Этаж 9 / Неверное помещение',
    status: 'ASSIGNED',
    priority: 'NORMAL',
    accessStatus: 'OPEN',
    position: 100,
    referencePhotos: 1,
    deleted: true,
    steps: [step('Проверить помещение'), step('Начать ошибочную работу')],
  },
  {
    number: 18,
    title: 'Смонтировать оконечное оборудование инженерных систем',
    description:
      'Уточнённое описание монтажа после согласования с заказчиком и генеральным подрядчиком.',
    objectKey: 'north',
    location: 'Этаж 2 / Пом. 218',
    status: 'ACCEPTED',
    priority: 'NORMAL',
    accessStatus: 'OPEN',
    position: 16,
    referencePhotos: 2,
    steps: [
      step('Проверить уточнённые технические решения'),
      step('Смонтировать оборудование'),
      { ...step('Старый будущий этап'), deleted: true },
      step('Выполнить итоговую проверку'),
    ],
  },
];

export const expectedTaskPhotoCount = (task: ExtendedTaskSpec): number =>
  task.referencePhotos + task.steps.reduce((sum, item) => sum + (item.photoCount ?? 0), 0);

export function assertExtendedTestdataDefinition(): void {
  if (extendedTaskSpecs.length < 18)
    throw new Error('Extended suite must contain at least 18 tasks');
  const numbers = new Set(extendedTaskSpecs.map(({ number }) => number));
  if (numbers.size !== extendedTaskSpecs.length)
    throw new Error('Extended task numbers must be unique');
  const activePositions = extendedTaskSpecs
    .filter((task) => !task.deleted && task.status !== 'COMPLETED' && task.status !== 'CANCELLED')
    .map(({ position }) => position);
  if (new Set(activePositions).size !== activePositions.length)
    throw new Error('Active task positions must be unique');
  if (extendedTaskSpecs.find(({ number }) => number === 14)?.referencePhotos !== 12)
    throw new Error('Maximum photo scenario must contain 12 reference photos');
  if (extendedTaskSpecs.find(({ number }) => number === 12)?.steps.length !== 20)
    throw new Error('Long task scenario must contain 20 steps');
}
