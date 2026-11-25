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
