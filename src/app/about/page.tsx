import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "About Vocab Coach" };

// Brief §9: claims and numbers come only from docs/research.md; efficacy is framed as a hypothesis under test.

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
      <div className="space-y-2 text-stone-800">{children}</div>
    </section>
  );
}

const List = ({ items }: { items: ReactNode[] }) => (
  <ul className="list-disc space-y-1 pl-5">
    {items.map((x, i) => (
      <li key={i}>{x}</li>
    ))}
  </ul>
);

export default function About() {
  return (
    <article className="space-y-8 pt-2">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-stone-900">About Vocab Coach</h1>
        <p className="text-stone-700">A working prototype for one idea: turn words you half-know into words you actually say.</p>
      </header>

      <Section title="The problem">
        <p>
          Intermediate learners recognise far more words than they can retrieve when speaking under pressure, and words learned on purpose fade
          fast. A 2020 meta-analysis (Webb, Yanagisawa and Uchihara; 22 studies) found average gains of 60.1% on immediate meaning recall. On
          delayed tests these fell to 39.4% for meaning and 25.1% for form.
        </p>
        <p>The problem worth solving first: &ldquo;I know the word when I see it, but it doesn&apos;t come out when I speak.&rdquo;</p>
      </Section>

      <Section title="Who it is for">
        <p>
          Indian adults (18 and over) preparing for IELTS, PTE or DET speaking at roughly B1 to B2. They face a deadline and are scored on the
          range of words they use; Lexical Resource is one of four IELTS speaking criteria.
        </p>
      </Section>

      <Section title="The loop: Seed, Stretch, Spiral">
        <List
          items={[
            <>
              <strong>Seed.</strong> The coach uses a new word in conversation, gives a plain meaning and one common phrase, and asks for your own
              sentence.
            </>,
            <>
              <strong>Stretch.</strong> Two to four minutes later, a question needs that word. If you are stuck, hints escalate: a meaning cue,
              then the first sound, then a choice of two, then the answer.
            </>,
            <>
              <strong>Spiral.</strong> On later days, words the scheduler marks as due come back in a new context. Scheduling uses FSRS with a
              desired retention of 90%.
            </>,
          ]}
        />
        <p>
          Each word climbs an evidence ladder: recalled with a hint, recalled, used in a sentence, used on your own. A word counts as mastered
          after use in a sentence on two different days, at least one use on your own, and a success at least 7 days after you first met it.
        </p>
      </Section>

      <Section title="What code decides, and what the AI does">
        <p>
          <strong>Code decides</strong>, the same way every time: which words are due and the pacing; whether the target word was said (any
          inflection, with the speech recogniser&apos;s confidence); the hint level; the evidence level and review rating; and the Indian
          English forms that are never corrected.
        </p>
        <p>
          <strong>The AI</strong> writes the conversational replies and judges whether a word was used with the right meaning and a natural
          phrase, with a confidence score. It never chooses words, decides when to test, or decides whether a word is learnt. Definitions and
          phrases come only from a curated word list.
        </p>
      </Section>

      <Section title="Out of scope">
        <p>
          Accounts, a server database, payments, pronunciation scoring, score or band prediction, accent scoring, avatars, social features,
          streaks, native speech-to-speech, hands-free listening, native apps, and anyone under 18.
        </p>
      </Section>

      <Section title="Known limitations">
        <List
          items={[
            "There is no evidence yet that speaking practice like this beats flashcards, which are among the most effective ways to learn words on purpose. That is the hypothesis this prototype exists to test.",
            "FSRS was fitted to flashcard self-grades, so mapping spoken evidence onto it is itself a hypothesis.",
            "Speech recognition is measurably worse on Indian-accented English. On the Svarah benchmark, commercial Google and Azure Indian-English models had about 21% word error rate, against 7.2% for Whisper-large. When the recogniser is unsure about a target word, the coach asks once, then changes nothing for that word.",
            "The AI's judgement can be inconsistent. Every caption has a “Report a wrong correction” button, and reports are kept in your export.",
            "The 40-word list was written for this prototype and approved by its product owner; word levels and frequency bands are estimates, not taken from a licensed list.",
            "Replies currently take a few seconds to start.",
            "Your progress stays in this browser and audio isn't stored. Your speech is transcribed by Deepgram, and the text is sent to OpenAI to write replies; OpenAI may keep API text for up to 30 days for abuse monitoring.",
          ]}
        />
      </Section>

      <Section title="The first experiment to run">
        <p>
          <strong>Voice practice in context versus flashcards.</strong> At equal exposure, is day-7 spoken recall plus prompted use higher for
          words practised by voice?
        </p>
        <List
          items={[
            "About 120 beta learners at B1 to B2. Each learner's 12 words are randomised: 6 practised by voice, 6 with in-app FSRS flashcards.",
            "Primary measure: day-7 recall plus use, per word.",
            "Guardrails: completion, enjoyment, and equal time on task.",
            "Duration: two weeks.",
            "Comparing separate groups would need 63 learners per arm to detect a 10-point difference (90 allowing for drop-out); comparing words within each learner needs fewer.",
            "Confounders to control: how recall is tested (add a written test), word difficulty, and novelty.",
          ]}
        />
      </Section>

      <Section title="Sources">
        <p className="text-sm text-stone-700">
          Webb, Yanagisawa and Uchihara 2020 (Modern Language Journal 104(4)); Javed et al. 2023, Svarah (arXiv 2305.15760); the
          open-spaced-repetition FSRS benchmark; and the project&apos;s research blueprint (October 2026), which is the source of every claim on
          this page.
        </p>
      </Section>
    </article>
  );
}
