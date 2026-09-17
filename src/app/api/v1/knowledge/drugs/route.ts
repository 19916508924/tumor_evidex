import { listKnowledgeEntities } from '../entity-list';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return listKnowledgeEntities(request, 'drug');
}
