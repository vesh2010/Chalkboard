export const voiceStyles = {
  "gentle": {
    "label": "Gentle teacher",
    "speed": 0.92,
    "localScale": 1.11,
    "pause": 430,
    "questionPause": 630,
    "pitch": 1.02,
    "stability": 0.56,
    "expressiveness": 0.12,
    "description": "Speak softly but clearly, with a warm, natural conversational rhythm. Articulate consonants. Give the learner space after a new idea."
  },
  "clear": {
    "label": "Clear explainer",
    "speed": 0.98,
    "localScale": 1.04,
    "pause": 310,
    "questionPause": 510,
    "pitch": 1,
    "stability": 0.58,
    "expressiveness": 0.1,
    "description": "Use crisp, clear pronunciation and an even, conversational pace. Emphasize the key word without exaggeration."
  },
  "story": {
    "label": "Storytelling guide",
    "speed": 0.95,
    "localScale": 1.07,
    "pause": 380,
    "questionPause": 600,
    "pitch": 1.03,
    "stability": 0.47,
    "expressiveness": 0.23,
    "description": "Sound like a friendly storyteller, warm and expressive without theatrical delivery. Let examples unfold naturally."
  },
  "exam": {
    "label": "Exam coach",
    "speed": 1.02,
    "localScale": 1,
    "pause": 260,
    "questionPause": 460,
    "pitch": 1,
    "stability": 0.6,
    "expressiveness": 0.1,
    "description": "Be encouraging and efficient, clearly articulate formulas and exam traps, and pause briefly before important answers."
  }
};
export function voiceStyle(name) { return Object.hasOwn(voiceStyles,name) ? voiceStyles[name] : voiceStyles.gentle; }
