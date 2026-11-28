# Chalkroom

Chalkroom is a voice-guided AI learning board. It turns a topic into a teacher-led lesson with progressive chalk writing, diagrams, captions, spoken explanations, practice questions, and voice interruption. A saved learning profile helps every lesson explain why the topic matters to the learner's work and goals.

The interface and implementation are original. The project is inspired by modern AI tutoring products, but is not affiliated with Studdy AI or ElevenLabs.

## Highlights

- Full-screen textured green board with step-by-step chalk writing
- Automatic lesson progression without scrolling
- Synchronized narration, subtitles, teacher portrait, and lip movement
- Voice interruption: pause, ask a question, then resume from the same line
- Replay any board line and return to the previous teaching position
- Web-grounded lessons and source links when the provider supports search
- Persistent learner profile for role, goals, background, and projects
- Personal work-context example at the beginning of a lesson
- Lesson library, browser-saved progress, and practice questions
- Gemini, OpenAI, Alibaba Cloud, Token Harbor, FreeLLMAPI, and custom JSON APIs
- Local API router with ordered provider failover
- Optional ElevenLabs voice support

## Quick start

### Windows

1. Copy `.env.example` to `.env` if you want to use the local provider router.
2. Add your API keys to `.env`. Leave unused slots blank.
3. Run `Start Local Chalkroom.cmd`.
4. Open [http://127.0.0.1:31416](http://127.0.0.1:31416).

### Node.js

Node.js 18 or newer is recommended.

```bash
cp .env.example .env
node local.mjs
```

Then visit [http://127.0.0.1:31416](http://127.0.0.1:31416). The included sample lesson works without an API key.

## API configuration

Connect a model through **API settings** in the app, or select **Local API fallback** and place keys in the ignored `.env` file.

The local router reads `.env` on each request and tries numbered slots in order. If a request fails, times out, is rate-limited, or returns an unreadable lesson, Chalkroom hops to the next configured slot. Each attempt can count toward the provider's usage limits.

```dotenv
API_1_KEY=
API_1_URL=https://tokenharbor.ai/v1/chat/completions
API_1_MODEL=deepseek-v4.1-flash:free

API_2_KEY=
API_2_URL=http://127.0.0.1:31415/v1/chat/completions
API_2_MODEL=auto:fast

API_3_KEY=
API_3_URL=https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
API_3_MODEL=gemini-flash-latest

API_4_KEY=
API_4_URL=https://api.openai.com/v1/chat/completions
API_4_MODEL=gpt-4.1
```

Use the full OpenAI-compatible chat-completions endpoint in each `API_n_URL`. For the local FreeLLMAPI gateway shown above, the gateway process must be running on the same computer.

### Optional ElevenLabs voice

```dotenv
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
```

Only use a voice you own or have permission to use. Chalkroom does not ship or publish private API keys.

## Custom web APIs

The in-app custom provider supports an HTTPS JSON endpoint, model ID, authentication header, key prefix, request template, and response-text path. OpenAI-compatible endpoints work with the default template. Other services can use placeholders such as `{{prompt}}` and `{{model}}`.

The endpoint must allow requests from the browser. If it does not support CORS, connect it through the local router instead.

## Supported lesson material

- Gemini: PDF, text, and images
- OpenAI: PDF, PowerPoint, Word, text, CSV, PNG, JPEG, and WebP
- Alibaba Cloud: plain text and images
- Custom providers: TXT, Markdown, and CSV

Uploads are limited to five files and 20 MB combined per lesson. For audio or video lectures, attach a transcript.

## Data and security

- `.env`, `.env.*`, and `.voice/` are ignored by Git.
- `.env.example` contains only blank placeholders and safe endpoints.
- Browser-saved API keys are opt-in through **Remember this key**.
- Topics, profiles, and attachments go to the selected AI provider when generating a lesson.
- Review the privacy and retention terms of every provider you configure.

Never commit a real `.env` file or paste API keys into issues, screenshots, or chat messages.

## Project structure

```text
Chalkroom/
├── dist/                    # Browser application and media
│   ├── index.html
│   ├── app.js
│   ├── live-board.js
│   ├── teacher-face.js
│   └── style.css
├── .env.example             # Safe configuration template
├── fallback.mjs             # Ordered provider failover
├── voice.mjs                # Local voice integration
├── local.mjs                # Static server and local API routes
└── Start Local Chalkroom.cmd
```

## Development checks

Start the local server before browser-based checks:

```bash
node local.mjs
```

Validation harnesses in the parent workspace cover API persistence, provider routing, failover, progressive lessons, interruption, line replay, work-context refresh, and chalk-pointer synchronization.

## Troubleshooting

### `401 Unauthorized`

Check that the key belongs to the configured provider and that its authorization header format is correct.

### `404 Not Found`

Use the full generation endpoint, not a model information page. OpenAI-compatible services commonly end in `/v1/chat/completions`.

### `502 Bad Gateway` or timeout

Confirm the upstream gateway is running, the selected model exists, and its provider is healthy. Configure another numbered slot as a backup.

### Browser cannot reach `127.0.0.1`

Start `local.mjs` and any separate local gateway used by an API slot. A browser cannot connect to a localhost gateway running on another device.

## License

No open-source license has been selected yet. Add a `LICENSE` file before allowing reuse or redistribution.

## Professor Paws — Batch 1

Professor Paws is a vector golden-retriever tutor with audio-driven mouth movement, a gentle nod, blinking and ear motion. Reduced-motion settings are respected. Open the lesson outline (☰) to choose Gentle teacher, Clear explainer, Storytelling guide, or Exam coach. The voice engine is independent of the lesson AI provider.

The new default Auto voice uses ElevenLabs when both `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` exist in the local `.env`; otherwise it uses the installed Cori neural Piper model. If a configured ElevenLabs request fails, the app reports the error rather than silently changing voices. Local and browser voice quality depends on the installed model or device. No cloud voice credentials are included. Voice style and engine choices persist in the browser. Existing prerecorded sample audio is unchanged.

Long local narration uses sentence-aware prefetch and playback. Follow-up questions ask for the direct answer first and omit bulky SVG path data from the context. FreeLLMAPI now keeps its extended primary timeout when there are no backup providers, with authentication failover when backups are available.

## Professor Paws — Batch 2

Paws now reacts to lesson preparation, listening, explanation, key insights, self-checked practice results and lesson completion. The dog personality is intentionally subtle. Reduced motion disables animated effects while keeping readable state labels. Chalk lettering is brighter, active and paused lines are clearer, and graphs have larger labels and faint grid lines.

Pause voice, ask a question, or open Practice without losing the current cue. For generated media, resuming restores the active sentence segment and seek position where supported; browser speech resumes from the last reported word boundary (or repeats the cue if none is available). Changing the voice/engine restarts the current cue rather than seeking into a different recording. Position is session-only, not saved across refreshes.

Practice includes Easy, Medium and Challenge questions, optional hints, worked answers, and learner self-assessment. Existing untagged questions appear under Saved review. New lessons request one question at each level, and connected lessons can generate more at the chosen level. Sample lessons include three fixed questions. Typed answers and self-check counts are session-only; no unreliable automatic correctness grading is used.

## Professor Paws — Batch 3

Choose Beginner, School, Competitive exam or Fast revision before starting a new lesson. The mode changes the generation instructions and remains attached to that lesson for continuation and follow-up requests. Study preferences are saved in browser storage: default mode, narration pace, preferred practice difficulty, search default, voice style and engine. Open Learning profile / Study preferences to adjust them. Reset applies after Save; it does not erase the learning profile, lesson history or API keys. The learner profile and learning instructions are sent to the selected AI provider.

Open the lesson menu for concept cards (definition, formula, rule, example, mistake or takeaway). New lessons may include AI-generated cards; older lessons use their existing board points without another API request. Cards are copyable. Sources distinguish provider citations from AI-suggested or older unverified links. Chalkroom does not independently verify citations; no link is proof of web search by itself.

When a lesson start or follow-up fails, the recovery panel keeps the original topic, attachments, mode or question in memory for a deliberate retry. A failed continuation can also be retried without replacing the opening step. API settings and faster FreeLLMAPI routing are offered for applicable errors. No unattended retries or provider changes occur; retries may use provider credits. Retry state is session-only and stale requests are rejected when the learner changes lessons or steps.

## Professor Paws — Batch 4

Choose Professor Paws, Captain Canine, Astro Pup or Detective Doggo from the home navigation or lesson menu. Each character has its own vector theme, accessories, personality prompt and recommended delivery style. The selected voice engine stays the same, including the optional ElevenLabs configuration; character selection does not invent new voice IDs. Voice style can be overridden independently.

Session recap is available from the lesson menu and when playback reaches the end. It collects existing board points, mistake cards and practice questions without additional AI calls. It distinguishes steps completed this visit from material available for review. Pawgress records local calendar study days, completed teaching steps, completed lessons and self-reviewed practice answers, deduplicating lesson steps and questions. A lesson counts as complete only after all main steps have been played through and no continuation is pending. Streaks are browser-local; no accounts, analytics service or automatic grading. Reset Pawgress does not delete lessons or preferences.

First-run onboarding is optional and prefilled with existing settings. Choose a tutor, recommended voice style (or override it), goal, mode and pace, or skip. Preferences can be changed later. Existing prerecorded sample narration is not regenerated.

Pawgress retains up to 730 study dates, 500 lesson records and 2,000 reviewed question identifiers in local browser storage to keep storage bounded. The most recent topic list uses the last recorded activity time. The tutor chooser uses previews of the actual vector character artwork.

## API regression and live smoke tests

Run `node --test tests/api-regression.test.mjs` from Chalkroom with Node 22+. The regression suite exercises the actual lesson adapters and router against deterministic mocked responses; it does not call paid APIs. Run the local app, then `node tests/live-api-smoke.mjs --auto` for configured .env fallback providers, or set `CHALKROOM_TEST_KEY` privately in your terminal and run `node tests/live-api-smoke.mjs` for FreeLLMAPI. The live script asks before sending six requests and may use credits. It checks response structure, not factual teaching quality or audio.

### Gemini free-tier quota settings

Chalkroom now defaults to the exact `gemini-3.6-flash` model rather than the rolling Flash alias. Set the model ID in API settings to match your own AI Studio project. Google Search grounding defaults off for Gemini (separate from other providers); turn it on only if your project has eligible grounding quota. Confirmed grounding-only errors can retry once without search and disclose missing live sources. Text-model 429s are not automatically retried. Error messages show model, quota IDs, zero/daily limits and retry delay when supplied. Local Chalkroom continues using its selected neural voice engine, independent of Gemini text quota. Web-only Gemini uses device speech by default; optional cloud speech falls back to device speech for quota/access errors. Browser voice quality depends on installed voices.
