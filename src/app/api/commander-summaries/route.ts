import { NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

// Cache the summaries in memory
let summariesCache: unknown = null
let lastModified: number = 0

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'data', 'commander-summaries.json')
    
    // Check file modification time
    const stats = await fs.stat(filePath)
    const mtime = stats.mtimeMs
    
    // Use cache if file hasn't changed
    if (summariesCache && mtime === lastModified) {
      return NextResponse.json(summariesCache)
    }
    
    // Read and parse file
    const content = await fs.readFile(filePath, 'utf-8')
    summariesCache = JSON.parse(content)
    lastModified = mtime
    
    return NextResponse.json(summariesCache)
  } catch (error) {
    console.error('Failed to load commander summaries:', error)
    return NextResponse.json(
      { error: 'Failed to load summaries', summaries: {} },
      { status: 500 }
    )
  }
}
