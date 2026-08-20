export type PresentationKind =
  | 'TEXT'
  | 'SUMMARY'
  | 'FLOW'
  | 'TIMELINE'
  | 'METRIC'
  | 'COMPARISON'
  | 'STATUS'
  | 'RELATIONSHIP'
  | 'HIERARCHY'
  | 'GRAPH'
  | 'EVIDENCE'
  | 'WARNING'
  | 'CODE'
  | 'ACTION';

export type PresentationSection = {
  label: string;
  text: string;
};

export type PresentationRow = {
  label: string;
  value: string;
};

export type PresentationMetric = {
  label: string;
  value: string;
  min?: number;
  max?: number;
};

export type PresentationModel = {
  kind: PresentationKind;
  title?: string;
  text?: string;
  steps?: string[];
  rows?: PresentationRow[];
  metrics?: PresentationMetric[];
  sections?: PresentationSection[];
  code?: string;
  graph?: Array<{ from: string; to: string }>;
};

export type JarvisPresentation = {
  rawResponse: string;
  model: PresentationModel;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\s+\n/g, '\n').replace(/\n\s+/g, '\n').trim();
}

function looksLikeStatusLine(line: string): boolean {
  return /\b(PASS|FAIL|BLOCKED|READY|ERROR|ACTIVE|RESOLVED|REJECTED|CONFIRMED|WEAKENING)\b/i.test(line);
}

function looksLikeFlowLine(line: string): boolean {
  return /(\||->|→|↓|=>|\s+\d+\s*\)|\s+\d+\s*\()/.test(line) || /^[A-Z][A-Za-z0-9\s/\-]+\s*(?:\n\s*(?:↓|→|->|=>)\s*\n\s*[A-Z][A-Za-z0-9\s/\-]+)+/m.test(line);
}

function extractFlowSteps(raw: string): string[] | null {
  const keywords = ['EVIDENCE', 'SIGNAL', 'CONSTRUCT', 'PATTERN', 'KNOWLEDGE', 'INTELLIGENCE', 'DECISION', 'SOURCE', 'OUTCOME', 'CONSTRAINT'];
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const token of keywords) {
    const regex = new RegExp(`\\b${token}\\b`, 'gi');
    if (regex.test(raw)) {
      const match = raw.match(new RegExp(`\\b${token}\\b`, 'i'));
      if (match) {
        const value = token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
        if (!seen.has(value)) {
          ordered.push(value);
          seen.add(value);
        }
      }
    }
  }

  if (ordered.length >= 3) return ordered;

  const arrowMatches = raw.match(/\b([A-Za-z][A-Za-z0-9\s/\-]+?)\b\s*(?:\n|\s*(?:↓|→|->|=>)\s*\n|\s+(?:goes into|feeds|supports|matches|becomes|derives from)\s+)(?:\b[A-Za-z][A-Za-z0-9\s/\-]+\b)/gi);
  if (!arrowMatches) return null;

  const steps = arrowMatches
    .map((match) => match.split(/\s*(?:goes into|feeds|supports|matches|becomes|derives from)\s*/i)[0].trim())
    .filter(Boolean)
    .slice(0, 8);

  return steps.length >= 2 ? steps : null;
}

function looksLikeMetricLine(line: string): boolean {
  return /\b(?:confidence|support|structure|symptoms|constraint|counterevidence|latency|score|count|percentage|progress)\b/i.test(line) && /\d+(?:\.\d+)?/.test(line);
}

function looksLikeEpistemicSection(line: string): boolean {
  return /^(OBSERVED|EVIDENCE|DERIVED INTELLIGENCE|PATTERN CANDIDATES|LIKELY CONSTRAINTS|COUNTEREVIDENCE|MISSING STATE|MISSING|STATUS|PATTERN|CONSTRAINTS)$/i.test(line.trim());
}

function stripCodeFence(value: string): string {
  return value.replace(/^```[\w-]*\n?/i, '').replace(/\n?```$/i, '').trim();
}

function parseStatus(raw: string): PresentationModel {
  const rows = raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.+?)\s+([A-Z][A-Z0-9 _-]*)$/);
      if (!match) return null;
      return { label: match[1].trim(), value: match[2].trim() };
    })
    .filter((row): row is PresentationRow => Boolean(row));

  return {
    kind: 'STATUS',
    title: 'STATUS',
    rows,
  };
}

function parseFlow(raw: string): PresentationModel {
  const lines = raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^\s*(?:↓|→|->|=>|\||\-\-\-|\*+)\s*$/.test(line));

  const steps = lines.filter((line) => !/^\s*(?:Knowledge|Intelligence|Evidence|Signal|Construct|Pattern|Decision|Architecture|System|Result)\s*$/i.test(line));
  const finalSteps = steps.length > 0 ? steps : lines;

  return {
    kind: 'FLOW',
    title: 'FLOW',
    steps: finalSteps.slice(0, 12),
  };
}

function parseMetrics(raw: string): PresentationModel {
  const metrics: PresentationMetric[] = [];
  const lines = raw.split(/\n+/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(.+?)\s+([-+]?\d+(?:\.\d+)?)(?:\s*\(?\d*%?\)?)?$/);
    if (!match) continue;
    const label = match[1].trim();
    const value = match[2].trim();
    if (!label || !value) continue;
    metrics.push({ label, value });
  }

  if (metrics.length === 0) {
    return { kind: 'TEXT', title: 'TEXT', text: raw };
  }

  return {
    kind: 'METRIC',
    title: 'METRICS',
    metrics,
  };
}

function parseEvidence(raw: string): PresentationModel {
  const sections: PresentationSection[] = [];
  const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  let current: PresentationSection | null = null;

  for (const line of lines) {
    if (looksLikeEpistemicSection(line)) {
      if (current) sections.push(current);
      current = { label: line.trim(), text: '' };
      continue;
    }
    if (current) {
      current.text = current.text ? `${current.text}\n${line}` : line;
    }
  }

  if (current) sections.push(current);

  return {
    kind: 'EVIDENCE',
    title: 'EVIDENCE',
    sections: sections.length > 0 ? sections : [{ label: 'OBSERVED', text: raw }],
  };
}

function parseCode(raw: string): PresentationModel {
  const code = stripCodeFence(raw);
  return {
    kind: 'CODE',
    title: 'CODE',
    code,
  };
}

export function createJarvisPresentation(rawResponse: string): JarvisPresentation {
  const clean = normalizeWhitespace(rawResponse ?? '');
  const model: PresentationModel = { kind: 'TEXT', title: 'TEXT', text: clean || 'No content available.' };

  if (!clean) {
    return { rawResponse: '', model };
  }

  if (/^```/.test(clean)) {
    return { rawResponse: clean, model: parseCode(clean) };
  }

  const lines = clean.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  const explicitSequence = /(?:^|\n)\s*[A-Za-z][A-Za-z0-9\s/\-]+\s*(?:\n\s*(?:↓|→|->|=>)\s*\n\s*[A-Za-z][A-Za-z0-9\s/\-]+){2,}/m;
  if (explicitSequence.test(clean)) {
    const flowSteps = extractFlowSteps(clean) ?? lines.filter((line) => !/^(?:↓|→|->|=>|\|)$/.test(line));
    return { rawResponse: clean, model: { kind: 'FLOW', title: 'FLOW', steps: flowSteps.slice(0, 12) } };
  }

  if (lines.length > 1 && lines.every((line) => looksLikeStatusLine(line))) {
    return { rawResponse: clean, model: parseStatus(clean) };
  }

  if (lines.some((line) => looksLikeMetricLine(line))) {
    return { rawResponse: clean, model: parseMetrics(clean) };
  }

  if (lines.some((line) => looksLikeEpistemicSection(line))) {
    return { rawResponse: clean, model: parseEvidence(clean) };
  }

  const flowSteps = extractFlowSteps(clean);
  if (flowSteps && flowSteps.length >= 2) {
    return { rawResponse: clean, model: { ...parseFlow(clean), steps: flowSteps } };
  }

  if (looksLikeFlowLine(clean)) {
    return { rawResponse: clean, model: parseFlow(clean) };
  }

  if (/\b(?:Evidence|Signal|Construct|Pattern|Decision|Knowledge|Intelligence)\b/i.test(clean) && /(?:goes into|becomes|feeds|supports|matches|derived from)/i.test(clean)) {
    const steps = extractFlowSteps(clean);
    return { rawResponse: clean, model: { kind: 'FLOW', title: 'FLOW', steps: steps ?? ['Evidence', 'Knowledge'] } };
  }

  return { rawResponse: clean, model: { kind: 'TEXT', title: 'TEXT', text: clean } };
}

export function parseJarvisPresentation(rawResponse: string): JarvisPresentation {
  return createJarvisPresentation(rawResponse);
}
