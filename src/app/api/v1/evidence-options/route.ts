import { evidenceQueryOptions } from '@/shared/services/evidence/query-catalog';

export function GET() {
  return Response.json({ code: 0, message: 'ok', data: evidenceQueryOptions });
}
