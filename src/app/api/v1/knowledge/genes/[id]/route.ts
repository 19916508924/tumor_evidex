import { entityDetailResponse } from '../../detail-route';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return entityDetailResponse(request, 'gene', id);
}
