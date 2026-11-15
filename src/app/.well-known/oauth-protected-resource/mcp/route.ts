import { protectedResourceDocument } from '@/lib/connector/resource-metadata'

export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(protectedResourceDocument())
}
