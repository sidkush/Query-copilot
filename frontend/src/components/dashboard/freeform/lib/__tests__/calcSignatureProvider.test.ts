import { describe, it, expect } from 'vitest';
import { buildSignatureProvider } from '../calcSignatureProvider';

const monaco = { languages: { SignatureHelpTriggerKind: { Invoke: 1, TriggerCharacter: 2 } } } as any;

const fakeModel = (text: string) => ({ getLineContent: () => text });

describe('buildSignatureProvider', () => {
  it('shows PERCENTILE signature + highlights active parameter 0 after "("', () => {
    const prov = buildSignatureProvider(monaco);
    const text = 'PERCENTILE(';
    const help = prov.provideSignatureHelp(
      fakeModel(text) as any,
      { lineNumber: 1, column: text.length + 1 } as any,
      null as any,
      { triggerKind: 1 } as any,
    ) as any;
    expect(help.value.signatures[0].label).toContain('PERCENTILE');
    expect(help.value.activeParameter).toBe(0);
  });

  it('highlights parameter 1 after "PERCENTILE([Sales],"', () => {
    const prov = buildSignatureProvider(monaco);
    const text = 'PERCENTILE([Sales],';
    const help = prov.provideSignatureHelp(
      fakeModel(text) as any,
      { lineNumber: 1, column: text.length + 1 } as any,
      null as any,
      { triggerKind: 1 } as any,
    ) as any;
    expect(help.value.activeParameter).toBe(1);
  });
});
