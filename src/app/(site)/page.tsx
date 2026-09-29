import { Features, Games, Hero, Install } from '@/components/sections';

export default function Home() {
  return (
    <>
      <main>
        <Hero />
        <Features />
        <Games />
        <Install />
      </main>
    </>
  );
}
