import { createDefinitionVersionRoute } from '../../../definition-version-routes';

export const runtime = 'nodejs';
export const POST = (request: Request, context: any) =>
  createDefinitionVersionRoute('workflows', request, context);
