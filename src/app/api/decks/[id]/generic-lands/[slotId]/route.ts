import { NextRequest } from 'next/server'
import { removeGenericLandSlot } from '@/lib/generic-land-store'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; slotId: string }> }
) {
  const { id, slotId } = await params

  const deckId = parseInt(id, 10)
  if (isNaN(deckId) || deckId <= 0) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const slotIdNum = parseInt(slotId, 10)
  if (isNaN(slotIdNum) || slotIdNum <= 0) {
    return Response.json({ error: 'Invalid slot ID' }, { status: 400 })
  }

  await removeGenericLandSlot(slotIdNum)

  return new Response(null, { status: 204 })
}
