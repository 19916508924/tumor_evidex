import { activateDefinitionVersionRoute } from '../../../../../definition-version-routes';

export const runtime = 'nodejs';
export const POST = (request: Request, context: any) =>
  activateDefinitionVersionRoute('workflows', request, context);
