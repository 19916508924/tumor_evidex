import { evaluateDefinitionVersionRoute } from '../../../../../definition-version-routes';

export const runtime = 'nodejs';
export const POST = (request: Request, context: any) =>
  evaluateDefinitionVersionRoute('workflows', request, context);
