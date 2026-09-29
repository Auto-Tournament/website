import { Footer, Nav } from '@/components/sections';
import { PageTransition } from '@/components/PageTransition';

// The main site's shared chrome: the floating nav and the footer persist
// across navigations (never part of the page-transition animation), with
// only the page content between them fading/blurring in and out.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <PageTransition>{children}</PageTransition>
      <Footer />
    </>
  );
}
