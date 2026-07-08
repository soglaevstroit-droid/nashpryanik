import { TaskPriority } from '@prisma/client';

export interface CreateTaskDto {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
}
