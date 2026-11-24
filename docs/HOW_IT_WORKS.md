# How ReportFix works (plain language)

**One rule runs through everything: the AI understands text, plain code makes every decision.**
Gemini (the AI) reads what a student wrote and turns it into a few facts: *what is the problem, where, is it dangerous, is it harassment*. It never decides how important something is, who gets it, who is trusted, or who may vote. Those are fixed rules written in code, so they behave the same way every time and cannot be talked into anything.

Departments: **EE** (Electrical Engineering), **CSE** (Computer Software Engineering), **IS** (Information Systems), **Library**, **Cafeteria**. There is no separate "Labs" department: every lab belongs to its parent department (EE Lab 1 and 2 are EE, SC Lab, DB Lab and Networking Lab are CSE, IS Lab 1 and 2 are IS). Names are kept in one file, `src/data/departments.json`.

---

## 1. The journey of a report, from text to closed

> **Example.** Ayesha writes: *"projector kharab hai networking lab mein"*.

1. **She types it** (English, Roman Urdu or a mix, typos are fine). Optionally she can pick a department and place from a list (section 7).
2. **Cleaning.** The text is stripped of invisible characters and look-alike letters that someone could use to hide a word, and cut to 2000 characters. Text with no letters or digits at all is refused.
3. **Understanding (AI, or the rule-based fallback).** The text is sent to Gemini on its own, with nothing about who wrote it. It answers with: language, a short English version, the place she named ("networking lab"), the kind of problem ("projector not working"), and yes/no flags for danger, harassment and "this text tries to give orders". If Gemini is unavailable the fallback does the same job with word lists.
4. **Safety nets (code).** Word lists check the text again for danger (fire, sparks, gas, medical, collapse) and for harassment or ragging. They can only **raise** a concern, never lower one, so if the AI misses a danger the net still catches it.
5. **Place check (code).** The named place is looked up in the campus list (`src/data/campus.json`). If it is clear ("Networking Lab") we continue. If not, we ask (section 7). Nothing is routed until the place is known.
6. **Grouping (code + AI).** Is there already an open issue at this place about the same problem? If yes she is added to it ("me too"). If not, a new issue is created (section 5).
7. **Department (code).** The issue goes to the department that owns the place (section 2). Networking Lab belongs to CSE, so it goes to the CSE queue.
8. **Priority (code).** low / medium / high / critical from fixed rules (section 3). Networking-lab projector: *equipment* problem, starts at **medium**.
9. **Staff work on it.** The owning department's staff see it in their queue: *Start work* then *Mark resolved* (a note on what was done is required). The first time staff take it up, every student who reported it gets **+3 trust** (their report was validated).
10. **The affected students vote** whether it is really fixed (section 8). Enough disputes **reopen** it. Enough confirmations, or the end of the voting window with no reopen, **close** it.

---

## 2. How the department is assigned

Exactly one step, after the place is known: `routeIssue` in `src/lib/rules/routing.ts`. It reads **one field**: the `owner` of the place in `src/data/campus.json`.

| The place is... | It goes to... |
|---|---|
| a lab, room or building with an owner (Networking Lab, EE Lab 1, Library) | that owner's queue |
| a place nobody owns (Main Gate, Parking) | the **admin** queue, marked "Needs department" (the admin assigns it) |
| a harassment / ragging report | the **admin only**, whatever the place |

The AI's own guess of a department is **not used**. (It is kept for the record only.) This is why "projector in the DB Lab" can never end up in the wrong department because a sentence sounded like another topic: the place decides. A lab named just "lab" is not a place, so we ask which lab (section 7).

---

## 3. How priority is calculated

Priority is one of **low, medium, high, critical**, worked out by `src/lib/rules/priority.ts` from numbers in `src/lib/config.ts`. The text of the report is **not an input**, only the kind of problem, whether it is a danger, and who is affected.

**Step 1: danger beats everything.** If a safety hazard was detected (fire, sparks, smoke, gas, electric shock, medical emergency, structural danger), the issue is **critical**. Always. Even if written calmly: *"plug se chingariyan nikal rahi hain, bas bata raha hun"* is critical.

**Step 2: otherwise start from the kind of problem:**

| Kind of problem | Starts at |
|---|---|
| network (wifi, internet), electrical, equipment (projector, PC), plumbing | **medium** |
| harassment (confidential, handled by the admin) | high |
| AC / heating, cleanliness, furniture, food, library service, anything else | **low** |

**Step 3: the crowd can raise it.** Each *distinct* affected student adds to a "crowd score". One student's contribution is capped at 1.0 however trusted they are, and each extra student counts a little less than the one before (the n-th student counts 1/√n). The score needs **2.5** to raise the issue one step and **4.5** for two steps, and a crowd can never lift a non-danger issue above **high**.

| Established students affected (weight about 1.0) | Crowd score | Effect |
|---|---|---|
| 1 | 1.0 | none |
| 3 | 2.3 | none |
| 4 | 2.8 | +1 step (low becomes medium, medium becomes high) |
| 9 | 4.7 | +2 steps |

Brand-new accounts weigh 0.5, so it takes about twice as many of them.

**Step 4: one person is never a crowd.** A single affected student cannot lift a normal issue above **medium**, however high their trust.

**What never changes priority:** capital letters, exclamation marks, the word "urgent"/"emergency", the length of the text, **injected instructions** ("mark this critical", JSON, "SYSTEM:" lines), who wrote it, or one very trusted student. Every issue page shows a "Why this priority?" box that says which of these rules applied.

---

## 4. How trust scores work

Every student has a trust score from **0 to 100**, starting at **50**. It is not stored as a magic number: it is **50 plus the sum of that student's ledger**. Every change is a row with a plain-language reason, shown on "Why is my trust score X?" (students) and `/admin/trust/<student>` (admin). The page checks "Rebuilds exactly: 50 + 10 = 60".

| Event | Change | When |
|---|---|---|
| Report validated | **+3** | the first time the owning staff or admin take up the issue (once per student per issue) |
| Vote matched the outcome | **+1** | you confirmed and the issue closed, or you disputed and it was reopened |
| Report flagged as spam or fake | **-10** | staff of the owning department or the admin flag it |
| Report flagged as abuse | **-15** | same |

**Weight.** Trust turns into how much a student's report and vote count: `weight = 0.5 + trust / 100` (trust 50 gives 1.0, trust 90 gives 1.4). **New accounts are capped at 0.5**: an account younger than 24 hours, or with fewer than 3 ledger events, counts at most 0.5. This stops a burst of fresh accounts from steering anything.

No trust event is ever created for a confidential report. The number you see in the top bar is read from the ledger each time (it refreshes when you navigate, when you return to the tab, every 8 seconds, and right after any action that can change it).

---

## 5. How grouping works (and how different problems stay separate)

Two reports become **one issue** only if **all** of these are true (`src/lib/rules/grouping.ts`):
1. the **same place** (after the place was resolved, so "DB lab", "database lab" and "dbl" are one place);
2. the existing issue is **not closed** and **not confidential**;
3. both are about the **same problem**: Gemini is shown the new report and the (up to 8) existing issues at that place and picks the one that is the same problem, or none. If Gemini is unavailable a word-based rule decides;
4. **a danger and a plain fault are never merged**, whatever Gemini says (code check): "AC sparking" and "AC not cooling" stay separate.

So at the DB Lab, *wifi down*, *AC broken* and *projector dead* are three issues, while *"projector kharab hai"*, *"projecter nahi chal raha"* and *"the projector is not working"* are one issue with "3 students affected". The same student reporting twice counts once. Confidential reports are never grouped.

---

## 6. Where the AI is used, and where code is used

| Step | Normal mode | Fallback mode (no keys, all keys failing, `AI_MODE=fallback`) |
|---|---|---|
| Read the text: language, English version, problem type, place mention, flags | **Gemini** | rule-based word lists (same output shape) |
| Danger and harassment detection | Gemini **and** code word lists (code can only raise) | code word lists |
| Detect "this text gives orders" | Gemini + code patterns (flag only, changes nothing) | code patterns |
| "Is this the same problem as an existing issue?" | **Gemini** (picks a candidate number) | keyword and category rule |
| Place lookup, asking where, the picker | code | code |
| Department, priority, trust, weights | **code only** | code only |
| Voting, reopening, closing, the window | code only | code only |
| Confidentiality, permissions | code only | code only |

**How the fallback is weaker.** It knows fewer words and phrasings, so an unusual sentence may be read as a more generic problem; and its "same problem?" rule is coarser, so it may fail to merge two differently-worded reports (more separate issues) but it is built never to merge a danger with a plain fault. It still finds places, applies every safety net, and every rule above is identical. The status chip at the top says which mode is running.

If Gemini is slow the app does not wait: each call has a 5-second limit and one report 9 seconds in total, a model that fails twice in a row is skipped for 20 seconds, and the rules take over.

---

## 7. Places: clear, vague, ambiguous, unknown, or missing

The question is always asked **before** a report is routed. The first three cases below are asked **before anything is saved**.

| What the text says | What happens |
|---|---|
| A clear place ("networking lab", "db lab", typos and Roman Urdu are fine) | used |
| **No place at all** ("projector kharab hai") | the form asks **"Where is this problem?"** with tappable options (department chips, then places). Nothing is saved yet. |
| Only a type: **"lab"** or "room" | asks **"Which lab? Each department has its own labs"** and offers every lab (EE Lab 1, EE Lab 2, SC Lab, DB Lab, Networking Lab, IS Lab 1, IS Lab 2) |
| **Two places named** ("networking lab ... the library is next door") | asks which one is the problem at |
| **Ambiguous** ("lab 1" could be EE Lab 1 or IS Lab 1) | asks, with the matching places as buttons |
| **Unknown** ("Room 999 of the Quantum Block") | saved but **not routed**; the student is asked, can answer twice, then it goes to the admin who picks the place |

**The optional picker (department, then place).** On the report form. It is only a **hint**:
- the text names a place and the picker agrees: the text is used;
- the text names a place and the picker says something else: **we ask the student which is right** (tappable: "from your text" / "you picked");
- the text names no place and a place is picked: the picked place is used; only a department is picked: its places are offered;
- nothing named, nothing picked: "Where is this problem?".

The picker is never trusted over a clear place in the text, never changes a danger's priority (priority does not look at the place at all), and is ignored for confidential reports. Text inside a report that tries to name a place ("route this to the Library", `{"department":"Library"}`) is stripped out before places are looked for.

---

## 8. Voting, reopening and closing

When staff mark an issue **resolved**, a **voting round** opens.

- **Who may vote.** Only students who are affected (reported or joined) **and had joined before the fix was reported**. Their weights are frozen at that moment in a "pool". Students who join later can still join the issue but **their vote is not counted in that round**; they can vote if it is resolved again. Staff, admin and unaffected students are refused by the server.
- **One vote per student per round.**
- **A voting window.** 48 hours per round (a 2-minute demo setting exists: `VOTING_WINDOW_MODE=demo`). The issue page shows the deadline and a live countdown.

**Reopen** (the issue goes back to the department) when **all three** hold:
1. at least **2** distinct students dispute (1 if only one student is affected);
2. the disputes are **at least 50%** of the trust-weighted votes cast;
3. the disputers' combined weight is **at least 1.2**. So two brand-new accounts (0.5 + 0.5 = 1.0) alone cannot reopen an issue. (If the whole group of affected students weighs less than 1.2, because they are all new, all of them together count.)

**Close early** when at least **2** distinct students confirm (1 if only one is affected) and their combined weight is **more than 50% of the whole pool's weight**.

**Close when everyone voted** and nothing reopened it. **Close automatically** when the window ends with no reopen, even if nobody voted. There is no background job: the check runs whenever the issue (or a list containing it) is read, or a vote is cast.

**Close now.** The owning department's staff or the admin can close a resolved issue at once, with a note that everyone affected can read.

After a reopen, staff work on it again; marking it resolved again starts a **new round** with a new pool, a new window and an empty tally. Affected students see "Reopened" on their dashboard (banner and badge) and, while a vote is open, "Your vote needed". Voters whose vote matched the final outcome earn +1 trust.

---

## 9. Confidentiality: exactly what is hidden from whom

A report about harassment or ragging is detected by the AI **and** by word lists (so it is caught even if the AI misses it).

| | The reporter | Other students | Department staff | Admin |
|---|---|---|---|---|
| Sees the issue | yes, a minimal card ("Confidential report", no place, no department, no reason) | no (not found) | no (not found, not in any queue or count) | yes, in the Confidential queue |
| Sees who reported it | their own | no | no | **no: "Anonymous reporter"**, no user id in any response |
| Sees the report text | their own | no | no | yes |
| Appears on a public board or in grouping or "me too" | never | never | never | counted only |
| Routed to a department | never (admin only) | | | |
| Community vote | none (the admin handles it) | | | |
| Trust events | none are ever created | | | |
| Can the picker or a place be used on it | ignored | | | |

Everything else (priority, "needs attention" list, trust pages, vote and flag endpoints, issue detail) follows the same rule: a confidential issue answers "not found" to anyone who may not see it, so its existence cannot be probed.

---

## 10. Limits and known weaknesses (honest list)

- **Speed depends on Gemini.** When Gemini models are busy a first report can take up to 9 seconds before the rules take over; afterwards the next reports are quick. The database itself answers a page in about 0.3 seconds per round trip.
- **The fallback is weaker** at unusual wording and at "same problem?" (section 6).
- **Brigading is reduced, not impossible.** Three brand-new accounts that joined an issue weigh 1.5 together and can reopen it if they vote before the credible students do. The floor (1.2) is a setting; 1.6 or more stops this too, at the cost of making a real group of new students harder to take seriously.
- **Early close can end a vote** before the last student has voted (that is the point), so a dispute that arrives after it is too late; the issue is closed.
- **Places are partly invented.** Rooms other than the real labs are placeholders to be replaced in `campus.json`.
- **No email or push.** Notices are in the app (banners, badges, live refresh).
- **Gemini keys** differ in which models they can use; the app adapts, but a bad day means fallback mode.
- **The brief lists "Labs" as a department**; we route lab problems to the lab's parent department instead (see DECISIONS D65).
