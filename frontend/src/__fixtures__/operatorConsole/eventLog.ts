// src/__fixtures__/operatorConsole/eventLog.ts
export type EventTag = 'OK' | 'WARN' | 'ERR';
export interface EventLogRow { ts: string; tag: EventTag; source: string; message: string; }

export const OPERATOR_EVENT_LOG: readonly EventLogRow[] = [
  { ts: '00:41:58', tag: 'OK',   source: 'waterfall.tier2',  message: 'turbo twin hit · 64ms'  },
  { ts: '00:41:47', tag: 'OK',   source: 'waterfall.tier0',  message: 'schema cache warm'      },
  { ts: '00:41:32', tag: 'WARN', source: 'agent.budget',     message: 'tool budget 18/20'      },
  { ts: '00:41:18', tag: 'OK',   source: 'sql.validator',    message: 'clean · 6 layers'       },
  { ts: '00:40:52', tag: 'ERR',  source: 'connector.bq',     message: 'transient 503 · retry 1'},
  { ts: '00:40:51', tag: 'OK',   source: 'connector.bq',     message: 'recovered on retry 1'   },
  { ts: '00:40:36', tag: 'WARN', source: 'ml.train',         message: 'sample size low · 42K'  },
  { ts: '00:40:14', tag: 'OK',   source: 'pii.mask',         message: 'masked 3 columns'       },
  { ts: '00:39:58', tag: 'OK',   source: 'audit.trail',      message: 'decision logged'        },
  { ts: '00:39:41', tag: 'WARN', source: 'chroma.memory',    message: 'stale entry evicted'    },
  { ts: '00:39:20', tag: 'OK',   source: 'agent.session',    message: 'compacted 6→1'          },
  { ts: '00:39:02', tag: 'OK',   source: 'dashboard.apply',  message: 'preset · operator-console' },
];
