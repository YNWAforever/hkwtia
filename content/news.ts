import {newsPostSchema, type NewsPostRecord} from '@/content/schemas';

export const newsPosts: NewsPostRecord[] = newsPostSchema.array().parse([]);
