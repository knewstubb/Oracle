import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data: builds, error } = await supabase
    .from('ref_commander_builds')
    .select('edhrec_theme_slug, archetype, theme');

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  // Count by slug
  const bySlug: Record<string, { count: number; archetype: string | null; theme: string | null }> = {};
  builds.forEach((b: any) => {
    const key = b.edhrec_theme_slug;
    if (!bySlug[key]) bySlug[key] = { count: 0, archetype: b.archetype, theme: b.theme };
    bySlug[key].count++;
  });

  // Sort by count
  const sorted = Object.entries(bySlug).sort((a, b) => b[1].count - a[1].count);

  console.log('| EDHREC Slug | # Cmdrs | Archetype | Theme |');
  console.log('|-------------|---------|-----------|-------|');
  sorted.forEach(([slug, data]) => {
    console.log(`| ${slug} | ${data.count} | ${data.archetype || '-'} | ${data.theme || '-'} |`);
  });

  console.log(`\nTotal: ${sorted.length} unique build types across ${builds.length} builds`);
}

main();
