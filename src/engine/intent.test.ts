import { describe, expect, it } from "vitest";
import { detectIntent } from "./intent";

describe("intent (brief §5)", () => {
  it("lets buttons win over the transcript", () => {
    expect(detectIntent("the traffic was bad", "dont_know")).toBe("dont_know");
  });

  it.each([
    ["I don't know", "dont_know"],
    ["I forgot", "dont_know"],
    ["No idea, sorry", "dont_know"],
    ["I can't remember the word", "dont_know"],
    ["Pardon?", "repeat"],
    ["Sorry, repeat please", "repeat"],
    ["Could you say that again?", "repeat"],
    ["Stop", "end"],
    ["Let's stop here", "end"],
    ["I want to end the session", "end"],
  ] as const)("%s → %s", (text, intent) => {
    expect(detectIntent(text)).toBe(intent);
  });

  it.each(["At the end of the day it is busy", "I go out every weekend", "I attend classes", "I repeat my notes daily"])(
    "ordinary speech stays ordinary: %s",
    (text) => {
      expect(detectIntent(text)).toBeNull();
    },
  );
});
