import { updateDefinitionVersionRoute } from '../../../../definition-version-routes';

export const runtime = 'nodejs';
export const PATCH = (request: Request, context: any) =>
  updateDefinitionVersionRoute('agents', request, context);
