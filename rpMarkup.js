/**
 * VORTEX RP markup rules:
 *   **bold**          = audible dialogue
 *   ***bold italic*** = emphasized audible dialogue (bold wins)
 *   *italic*          = action or internal thought; not audible
 *   _italic_          = action or internal thought; not audible
 *   unformatted       = narration/context
 */
function parseRpMarkup(content) {
  const segments = [];
  const tokenPattern = /(\*\*\*[\s\S]+?\*\*\*|\*\*[\s\S]+?\*\*|\*[\s\S]+?\*|(?<!\w)_[\s\S]+?_(?!\w))/g;
  let cursor = 0;
  let match;

  while ((match = tokenPattern.exec(content)) !== null) {
    if (match.index > cursor) {
      const narration = content.slice(cursor, match.index).trim();
      if (narration) segments.push({ type: 'narration', text: narration });
    }

    const token = match[0];
    if (token.startsWith('***')) {
      segments.push({ type: 'dialogue', text: token.slice(3, -3).trim() });
    } else if (token.startsWith('**')) {
      segments.push({ type: 'dialogue', text: token.slice(2, -2).trim() });
    } else {
      segments.push({ type: 'action_thought', text: token.slice(1, -1).trim() });
    }
    cursor = tokenPattern.lastIndex;
  }

  if (cursor < content.length) {
    const narration = content.slice(cursor).trim();
    if (narration) segments.push({ type: 'narration', text: narration });
  }

  return {
    segments,
    dialogue: segments.filter((item) => item.type === 'dialogue').map((item) => item.text),
    actionsAndThoughts: segments.filter((item) => item.type === 'action_thought').map((item) => item.text),
    narration: segments.filter((item) => item.type === 'narration').map((item) => item.text),
  };
}

module.exports = { parseRpMarkup };
