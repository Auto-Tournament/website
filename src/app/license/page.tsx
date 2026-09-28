import { permanentRedirect } from 'next/navigation';
import { links } from '@/components/links';

// Licenses and keys live in the console now: signing in with the email you
// paid with shows every license bought with it. This page used to have its
// own "get your key again" form; that was the same job the console already
// does, so it just sends people there (308, permanent).
export default function LicensePage() {
  permanentRedirect(links.account);
}
