import { definitionAuditRoute } from '../../../definition-version-routes';

export const runtime = 'nodejs';
export const GET = (request: Request, context: any) =>
  definitionAuditRoute('agents', request, context);
