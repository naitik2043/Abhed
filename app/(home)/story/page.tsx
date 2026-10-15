import type { Metadata } from 'next';
import { Story } from './story';

export const metadata: Metadata = {
  title: 'How it works · Abhed',
  description: 'Scroll through how Abhed governs every action an AI agent takes: the rulebook decides in milliseconds, big moves wait for a person, everything lands on a ledger.',
};

export default function StoryPage() {
  return (
    <>
      <h1 className="sr-only">How Abhed works</h1>
      <Story />
    </>
  );
}
