import { describe, expect, it } from 'vitest';
import {
  createJarvisPresentation,
  parseJarvisPresentation,
  type JarvisPresentation,
} from './presentation';

describe('jarvis presentation layer', () => {
  it('preserves the raw response and projects a deterministic visual model', () => {
    const raw = 'Evidence goes into Knowledge. Signals are derived from evidence.';
    const presentation = parseJarvisPresentation(raw);

    expect(presentation.rawResponse).toBe(raw);
    expect(presentation.model.kind).toBe('FLOW');
    expect(presentation.model.title).toMatch(/knowledge|flow/i);
  });

  it('falls back to text for unknown content', () => {
    const raw = 'This is a plain operational note with no structure.';
    const presentation = parseJarvisPresentation(raw);
    expect(presentation.model.kind).toBe('TEXT');
    expect(presentation.model.text).toContain('plain operational note');
  });

  it('renders status rows without altering the facts', () => {
    const raw = 'Bootstrap PASS\nBaseline PASS\nR4A PASS\nR4B PASS\nPromotion BLOCKED';
    const presentation = parseJarvisPresentation(raw);

    expect(presentation.model.kind).toBe('STATUS');
    expect(presentation.model.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Bootstrap', value: 'PASS' }),
        expect.objectContaining({ label: 'Promotion', value: 'BLOCKED' }),
      ])
    );
  });

  it('renders flow diagrams for explicit sequences', () => {
    const raw = 'Evidence\n↓\nSignal\n↓\nConstruct\n↓\nPattern';
    const presentation = parseJarvisPresentation(raw);

    expect(presentation.model.kind).toBe('FLOW');
    expect(presentation.model.steps).toEqual(['Evidence', 'Signal', 'Construct', 'Pattern']);
  });

  it('preserves numeric data when projecting metrics', () => {
    const raw = 'Pattern Candidate\nInvisible → Visible\nConfidence 0.79\nSupport\nStructure 0.85\nSymptoms 0.73\nConstraint 0.67\nCounterevidence 0.33';
    const presentation = parseJarvisPresentation(raw);

    expect(presentation.model.kind).toBe('METRIC');
    expect(presentation.model.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Confidence', value: '0.79' }),
        expect.objectContaining({ label: 'Structure', value: '0.85' }),
      ])
    );
  });

  it('keeps epistemic sections separate when diagnostic labels are present', () => {
    const raw = 'OBSERVED\nEvidence\nDERIVED INTELLIGENCE\nSignal\nPATTERN CANDIDATES\nInvisible → Visible\nLIKELY CONSTRAINTS\nOwnership';
    const presentation = parseJarvisPresentation(raw);

    expect(presentation.model.kind).toBe('EVIDENCE');
    expect(presentation.model.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'OBSERVED' }),
        expect.objectContaining({ label: 'DERIVED INTELLIGENCE' }),
      ])
    );
  });

  it('falls back safely when the visual payload is malformed', () => {
    const raw = '   ';
    const presentation = parseJarvisPresentation(raw);
    expect(presentation.rawResponse).toBe('');
    expect(presentation.model.kind).toBe('TEXT');
  });

  it('keeps code blocks visually separate from prose', () => {
    const raw = '```ts\nconst status = "BLOCKED";\n```';
    const presentation = parseJarvisPresentation(raw);
    expect(presentation.model.kind).toBe('CODE');
    expect(presentation.model.code).toContain('const status');
  });

  it('supports raw and visual modes with equivalent information', () => {
    const raw = 'Bootstrap PASS\nR4A PASS\nR4B PASS\nPromotion BLOCKED';
    const presentation = createJarvisPresentation(raw);
    expect(presentation.rawResponse).toBe(raw);
    expect(presentation.model.rows?.map((row) => row.value)).toEqual(['PASS', 'PASS', 'PASS', 'BLOCKED']);
  });
});
