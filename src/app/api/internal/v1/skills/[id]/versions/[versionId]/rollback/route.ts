import { rollbackDefinitionVersionRoute } from '../../../../../definition-version-routes';

export const runtime = 'nodejs';
export const POST = (request: Request, context: any) =>
  rollbackDefinitionVersionRoute('skills', request, context);
