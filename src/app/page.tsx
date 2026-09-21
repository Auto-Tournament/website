import { Features, Footer, Games, Hero, Install, Nav } from '@/components/sections';

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Features />
        <Games />
        <Install />
      </main>
      <Footer />
    </>
  );
}
