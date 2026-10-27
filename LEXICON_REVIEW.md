# Lexicon review

Generated from `src/data/lexicon.json` and `src/data/dialect_allowlist.json` by `npm run lexicon:review`. Do not edit by hand.

Status: approved 27 Oct 2026, as drafted: all 40 words, all 12 allowlist entries, and the judge-case labels in `evals/judge-cases.json`. Swaps from the brief's word list: none.

To change anything now, propose it in `CHANGES.md` first (brief §0 rule 4). `test/approved-content.test.ts` fails if these files change without a new sign-off.

Columns: **Hint 2** is the first sound the agent says; **Hint 3** is the wrong option offered next to the word; **Confusables** are never seeded or reviewed on the same day as the word.

## Review questions (answered 27 Oct 2026: keep everything as is)

1. **mitigate and exacerbate** are opposites in Environment, and mitigate's distractor (aggravate, from the brief's example) means exacerbate. They aren't marked as confusables, so both can be seeded on the same day. Keep, mark them confusable (which breaks the one-topic rule), or swap exacerbate for another Environment word?
2. **congested and bustling** (City and transport) both describe crowded places: congested is negative, bustling is lively. Keep both?
3. **setback and drawback** are marked as confusables of each other (different topics), so the planner never seeds or reviews them on the same day. OK?
4. **curb** (Environment) and **cut down on** (Health) overlap in meaning across topics and aren't marked confusable. OK?
5. **burnout** accepts the spelling `burn-out`, so a learner saying the verb "burn out" also gets credit. Speech-to-text often splits the word, which is why I added it. Keep?
6. **immerse yourself in** is matched as `immerse … in` with up to three words between, so "immersed myself in" and the passive "immersed in" both count. Keep?
7. **Hint 2 onsets are written as sounds** (for example `ig-zas` for exacerbate, `yoo-bik` for ubiquitous, `groo` for gruelling), because the agent speaks them. Happy with that, or would you rather have spelling-based onsets?
8. **CEFR levels and frequency bands are my estimates**, not taken from a licensed list (research §15 flags licensing as open).
9. **Allowlist: passed out** means "graduated" in Indian English but "fainted" elsewhere. The allowlist only stops it being corrected; it never changes meaning detection. OK?

## Work and study (8)

| # | Word | POS | CEFR | Band | Definition | Collocations | Example | Forms and variants | Hint 2 | Hint 3 | Confusables | Reviewed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **meticulous** | adjective | C1 | 2 | very careful about every small detail | meticulous planning; meticulous attention to detail | My sister is meticulous about checking every prescription at the pharmacy. | meticulous | me-ti | careless | none | yes |
| 2 | **procrastinate** | verb | C1 | 2 | keep delaying something you should do now | tend to procrastinate; procrastinate over a decision | I procrastinate all Sunday and then finish my assignment at midnight. | procrastinate; procrastinates; procrastinated; procrastinating | pro-cras | anticipate | none | yes |
| 3 | **juggle** | verb | B2 | 2 | manage several things at the same time | juggle work and family; juggle responsibilities | Many students juggle college classes and a part-time job at a call centre. | juggle; juggles; juggled; juggling | ju | struggle | struggle | yes |
| 4 | **demanding** | adjective | B2 | 1 | needing a lot of time, effort or skill | a demanding job; physically demanding | Working night shifts at the hospital is a demanding job. | demanding | de-man | relaxing | none | yes |
| 5 | **take on (separable)** | phrasal verb | B2 | 1 | accept a job or responsibility | take on extra work; take on a challenge | My father took on extra work to pay my coaching fees. | take on; takes on; took on; taken on; taking on | ta | take off | take off; take over | yes |
| 6 | **prioritise** | verb | B2 | 1 | decide which things are most important and do them first | prioritise your tasks; prioritise your health | During exam month, I prioritise revision over watching cricket. | prioritise; prioritises; prioritised; prioritising; prioritize (variant); prioritizes (variant); prioritized (variant); prioritizing (variant) | pri-o | postpone | none | yes |
| 7 | **setback** | noun | B2 | 2 | a problem that delays your progress | suffer a setback; a minor setback | Failing the driving test was a setback, but I passed on my second try. | setback; setbacks | set | comeback | drawback | yes |
| 8 | **rewarding** | adjective | B2 | 1 | making you feel satisfied because the effort was worth it | a rewarding experience; a rewarding career | Teaching my neighbour's children maths on weekends is really rewarding. | rewarding | re-war | exhausting | none | yes |

## City and transport (6)

| # | Word | POS | CEFR | Band | Definition | Collocations | Example | Forms and variants | Hint 2 | Hint 3 | Confusables | Reviewed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 9 | **bottleneck** | noun | C1 | 2 | a narrow point where traffic or work slows down | a traffic bottleneck; cause a bottleneck | The flyover near the station is a bottleneck every evening. | bottleneck; bottlenecks | bot | shortcut | none | yes |
| 10 | **gruelling** | adjective | C1 | 3 | very tiring and difficult over a long time | a gruelling commute; a gruelling schedule | Two hours on a crowded local train is a gruelling commute. | gruelling; grueling (variant) | groo | thrilling | none | yes |
| 11 | **congested** | adjective | B2 | 2 | too full of traffic or people to move easily | congested roads; heavily congested | The roads near the market are congested during Diwali shopping. | congested | con-jes | deserted | none | yes |
| 12 | **urban sprawl** | noun | C1 | 3 | a city spreading into the countryside without good planning | uncontrolled urban sprawl; tackle urban sprawl | Urban sprawl has turned the farms outside Pune into housing colonies. | urban sprawl | ur | urban renewal | none | yes |
| 13 | **infrastructure** | noun | B2 | 1 | the basic systems a place needs, like roads and power | improve infrastructure; public infrastructure | Better infrastructure, like the new metro line, has cut my travel time. | infrastructure; infrastructures | in-fra | architecture | none | yes |
| 14 | **bustling** | adjective | B2 | 2 | full of busy, noisy activity | a bustling market; bustling streets | Chandni Chowk is bustling with shoppers every weekend. | bustling | bus | peaceful | none | yes |

## Environment (6)

| # | Word | POS | CEFR | Band | Definition | Collocations | Example | Forms and variants | Hint 2 | Hint 3 | Confusables | Reviewed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 15 | **mitigate** | verb | C1 | 2 | make something bad less severe | mitigate the risk; mitigate the impact | Cleaning drains before the monsoon can mitigate flood damage. | mitigate; mitigates; mitigated; mitigating | mi-ti | aggravate | militate | yes |
| 16 | **deplete** | verb | C1 | 2 | use up a supply until little is left | deplete natural resources; deplete groundwater | Too many borewells have depleted the groundwater in our village. | deplete; depletes; depleted; depleting | de-pl | replenish | delete | yes |
| 17 | **sustainable** | adjective | B2 | 1 | able to continue for a long time without harming nature | sustainable development; a sustainable lifestyle | Carrying a cloth bag to the sabzi market is a small sustainable habit. | sustainable | sus-tay | disposable | none | yes |
| 18 | **curb** | verb | C1 | 2 | control or limit something bad | curb pollution; curb spending | The city banned firecrackers to curb air pollution. | curb; curbs; curbed; curbing | cur | boost | kerb | yes |
| 19 | **detrimental** | adjective | C1 | 2 | causing harm or damage | detrimental to health; a detrimental effect | Burning crop stubble is detrimental to air quality in Delhi. | detrimental | de-tri | beneficial | none | yes |
| 20 | **exacerbate** | verb | C1 | 3 | make a bad situation worse | exacerbate the problem; exacerbate flooding | Plastic in the drains exacerbates flooding during the monsoon. | exacerbate; exacerbates; exacerbated; exacerbating | ig-zas | alleviate | none | yes |

## Technology (6)

| # | Word | POS | CEFR | Band | Definition | Collocations | Example | Forms and variants | Hint 2 | Hint 3 | Confusables | Reviewed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 21 | **ubiquitous** | adjective | C1 | 3 | seeming to be everywhere at the same time | ubiquitous smartphones; become ubiquitous | UPI payments have become ubiquitous, even at roadside tea stalls. | ubiquitous | yoo-bik | unusual | none | yes |
| 22 | **reliant on** | adjective | B2 | 2 | needing someone or something in order to work or live | heavily reliant on; reliant on technology | My grandparents are now reliant on video calls to see their grandchildren. | reliant on | ri-ly | independent of | reliable | yes |
| 23 | **obsolete** | adjective | B2 | 2 | no longer used because something newer exists | become obsolete; obsolete technology | Pagers became obsolete when everyone got a mobile phone. | obsolete | ob-so | absolute | absolute | yes |
| 24 | **streamline** | verb | C1 | 2 | make a process simpler and more efficient | streamline the process; streamline operations | The new app streamlined the process of booking a gas cylinder. | streamline; streamlines; streamlined; streamlining | str | complicate | none | yes |
| 25 | **drawback** | noun | B2 | 1 | a disadvantage or problem with something | a major drawback; the main drawback | The main drawback of online classes is the poor network in my village. | drawback; drawbacks | draw | benefit | setback | yes |
| 26 | **intrusive** | adjective | C1 | 2 | entering your private life in an unwelcome way | intrusive questions; intrusive advertising | Apps that ask for my contacts and location feel intrusive. | intrusive | in-troo | inclusive | none | yes |

## Health and lifestyle (6)

| # | Word | POS | CEFR | Band | Definition | Collocations | Example | Forms and variants | Hint 2 | Hint 3 | Confusables | Reviewed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 27 | **sedentary** | adjective | C1 | 2 | involving a lot of sitting and little exercise | a sedentary lifestyle; sedentary work | Sitting at a desk all day in an IT job is very sedentary. | sedentary | se-den | active | none | yes |
| 28 | **in moderation** | phrase | B2 | 2 | in sensible amounts, not too much | eat sweets in moderation; drink tea in moderation | Jalebis are fine in moderation, but not every day. | in moderation | in mo | in excess | none | yes |
| 29 | **unwind** | verb | B2 | 2 | relax after a period of work or stress | unwind after work; a chance to unwind | I unwind after office by walking in the park near my flat. | unwind; unwinds; unwound; unwinding | un-wy | rewind | rewind | yes |
| 30 | **cut down on** | phrasal verb | B1 | 1 | eat, drink or do less of something | cut down on sugar; cut down on screen time | My doctor told me to cut down on fried snacks. | cut down on; cuts down on; cutting down on | cu | give up | cut out | yes |
| 31 | **hectic** | adjective | B2 | 1 | very busy and full of activity | a hectic schedule; a hectic week | The week before my sister's wedding was hectic. | hectic | hec | relaxed | none | yes |
| 32 | **burnout** | noun | B2 | 2 | extreme tiredness from working too hard for too long | suffer from burnout; avoid burnout | Working twelve-hour shifts every day led to burnout. | burnout; burnouts; burn-out (variant) | bur | workout | none | yes |

## Education (5)

| # | Word | POS | CEFR | Band | Definition | Collocations | Example | Forms and variants | Hint 2 | Hint 3 | Confusables | Reviewed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 33 | **hands-on** | adjective | B2 | 2 | learning by doing things yourself, not only reading | hands-on experience; a hands-on approach | My engineering college gives students hands-on experience in real workshops. | hands-on | han | theoretical | none | yes |
| 34 | **rote learning** | noun | B2 | 2 | memorising facts by repetition without understanding them | rely on rote learning; move away from rote learning | In school, we used rote learning to memorise history dates. | rote learning | ro | active learning | none | yes |
| 35 | **disparity** | noun | C1 | 2 | an unfair difference between groups or things | a wide disparity; the disparity between rich and poor | There is a big disparity between city schools and village schools. | disparity; disparities | dis-pa | similarity | none | yes |
| 36 | **accessible** | adjective | B2 | 1 | easy to reach, get or use | accessible to everyone; easily accessible | Free online lectures make good teaching accessible to students in small towns. | accessible | ak-ses | exclusive | acceptable | yes |
| 37 | **foster** | verb | C1 | 2 | help something develop over time | foster creativity; foster a love of reading | Our school library fosters a love of reading in young children. | foster; fosters; fostered; fostering | fos | hinder | none | yes |

## Travel (3)

| # | Word | POS | CEFR | Band | Definition | Collocations | Example | Forms and variants | Hint 2 | Hint 3 | Confusables | Reviewed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 38 | **off the beaten track** | phrase | C1 | 3 | far from the places most tourists visit | go off the beaten track; a village off the beaten track | We found a quiet waterfall off the beaten track near Coorg. | off the beaten track; off the beaten path (variant) | off | on the tourist trail | none | yes |
| 39 | **breathtaking** | adjective | B2 | 2 | extremely beautiful or impressive | a breathtaking view; breathtaking scenery | The view of the Himalayas from the hill station was breathtaking. | breathtaking; breath-taking (variant) | bre | disappointing | none | yes |
| 40 | **immerse yourself in (separable)** | phrase | C1 | 3 | become completely involved in something | immerse yourself in the culture; immerse yourself in a language | On my trip to Kerala, I tried to immerse myself in the local food and festivals. | immerse in; immerses in; immersed in; immersing in | i-mer | isolate yourself from | none | yes |

## Dialect allowlist (12)

Indian English forms that are never treated as errors. The recap may offer the international form as another way to say it, never as a correction.

| Phrase | Forms matched | Meaning | International option | Reviewed |
|---|---|---|---|---|
| **prepone** | prepone; prepones; preponed; preponing | move to an earlier time | bring forward | yes |
| **out of station** | out of station | away from your home town | out of town | yes |
| **do the needful** | do the needful; does the needful; did the needful; doing the needful; done the needful | do what is needed | do what's needed | yes |
| **cousin brother or sister** | cousin brother; cousin brothers; cousin sister; cousin sisters | a cousin, with their gender made clear | cousin | yes |
| **co-brother** | co-brother; co-brothers | the husband of your wife's sister | brother-in-law | yes |
| **batchmate** | batchmate; batchmates; batch mate; batch mates | someone who studied in the same year as you | classmate | yes |
| **passed out (graduated)** | passed out; pass out; passing out | graduated from a school or college | graduated | yes |
| **timepass** | timepass; time pass | something done just to pass the time | a way to pass the time | yes |
| **have a doubt (a question)** | have a doubt; has a doubt; had a doubt; having a doubt | have a question | have a question | yes |
| **revert (reply)** | revert; reverts; reverted; reverting | reply | get back to you | yes |
| **today itself** | today itself | today, not later | today | yes |
| **good name** | good name | your name (a polite way to ask) | your name | yes |
