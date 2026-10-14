# Nontechnical commissioner usability study

Status: ready to run; no participant sessions have been conducted or claimed.
Owner must supply willing participants. Do not contact or recruit anyone without
explicit authorization. Automated browser journeys are regression evidence, not
human usability evidence.

## Participants and environment

Start with five commissioners who rarely configure software or API services. Include
both desktop and phone use, and at least one participant who relies on keyboard
navigation or enlarged text. Record anonymous IDs P01–P05, device, viewport, app
version/commit, and the testing date. Do not record credentials, league chat text,
member details, or participant identities in this repository.

Use a separate temporary workspace, fictional league data, and controlled providers.
Demonstrate clipboard/download sharing using fictional text. Never send to a real
league during the study. Sample mode is suitable for the initial task; a controlled
connected workspace is needed for real report/schedule tasks. Have all settings in
review-before-send mode before each session. Live account setup is a separately
consented session, including any provider usage charges.

## Session script (20–30 minutes)

Say: “We’re testing Sidekick, not you. Tell me what you expect as you go. You can stop
at any time.” Ask permission before recording; written anonymous notes are sufficient.
Give each task without pointing to a control. Avoid explaining the interface until
the participant finishes or asks for help. Record assistance before giving it.

| Task            | Prompt                                                                             | Observable completion                                                                    |
| --------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Try it          | “Explore an example and change one sentence in a report.”                          | Chooses sample mode, picks a report, edits and saves it; recognizes it is fictional.     |
| Find a setting  | “Make future reports shorter.”                                                     | Uses search or Voice and saves the report-length setting.                                |
| Share           | “Get this saved report ready to paste into your group chat.”                       | Copies or downloads the saved draft; understands nothing was sent automatically.         |
| Schedule        | “Have rankings ready every Thursday at 10:30 AM, with your review before sending.” | Opens Schedule or task search, checks timezone and league scope, saves a draft schedule. |
| Stop automation | “Stop scheduled emails while keeping drafts available.”                            | Searches or edits policy, inspects the preview and confirms review-before-send.          |
| Recover         | “This report says delivery is unknown. Find out what to do next.”                  | Finds the FAQ/attempt; explains checking provider history before retrying.               |
| Resume          | “Close this page during league setup, then continue.”                              | Returns to saved progress; does not expect pasted secrets to be stored in the browser.   |

After tasks, ask what “draft,” “review before send,” and “planned run” mean. Ask
which screen was hardest, what they expected the search to do, and whether they
would feel comfortable using the app without help. Do not lead with proposed fixes.

## Notes template

For each participant/task record completion (independent/assisted/failed), time,
first click/search phrase, pauses over ten seconds, wrong turns, assistance, and a
brief anonymous observation. Search phrases that contain personal data or secrets
must be omitted/redacted. Do not add passive search telemetry to the product.

| Participant | Task | Completion | Time | Hesitation / wrong turn | Assistance | Observation |
| ----------- | ---- | ---------- | ---- | ----------------------- | ---------- | ----------- |
| P01         |      |            |      |                         |            |             |

Provisional success target: at least four of five participants complete each core
find/share/schedule/stop task independently. Any accidental send or misunderstanding
of sample data, recipients, or automatic delivery is a release-blocking usability
finding regardless of the average. A small study identifies problems; it does not
establish a statistically representative success rate.

Rank findings by blocked completion, consequence of mistakes, then frequency.
Implement the highest-impact fixes and repeat those tasks with new participants.
Store consented anonymous findings in a dated `docs/reviews/` record, explicitly
separating human observations from automated tests. Until sessions run, keep the
human-validation task open in `docs/tasks.md` and `docs/support-matrix.md`.
