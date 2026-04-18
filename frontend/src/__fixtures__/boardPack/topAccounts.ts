export interface BoardPackAccount { rank: number; name: string; mrr: string; shareOfMrr: string; }

export const BOARD_PACK_TOP_ACCOUNTS: readonly BoardPackAccount[] = [
  { rank: 1, name: 'Meridian Global',      mrr: '$318K', shareOfMrr: '10.8%' },
  { rank: 2, name: 'Northwind Industries', mrr: '$276K', shareOfMrr: '9.4%'  },
  { rank: 3, name: 'Halcyon Capital',      mrr: '$241K', shareOfMrr: '8.2%'  },
  { rank: 4, name: 'Ferro & Pike',         mrr: '$214K', shareOfMrr: '7.3%'  },
  { rank: 5, name: 'Clearwater Labs',      mrr: '$156K', shareOfMrr: '5.3%'  },
];
