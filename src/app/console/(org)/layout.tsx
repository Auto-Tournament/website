import { requireOrg } from '@/lib/console/session';

export const dynamic = 'force-dynamic';

// Pages inside an organization: requireOrg sends you to /welcome when you
// have none yet. The section links and the org switcher live in the
// console's single navbar now (src/components/console/ConsoleNav.tsx).
export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  await requireOrg();
  return <>{children}</>;
}
