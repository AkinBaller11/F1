// Alle Texte zentral. TODO: Mit Claims/Begriffen von https://www.reybex.com/ki-erp/ abgleichen.
export type Seg = {text: string; hl?: boolean};

export const content = {
  wordmark: 'Reybex',
  wordmarkSuffix: 'KI',
  pills: ['Verkauf', 'Einkauf', 'KI-Agenten', 'Lager', 'Buchhaltung'],
  selectedPill: 2,
  modelLabel: 'Reybex KI',
  prompt1: [
    {text: 'Finde alle '},
    {text: 'überfälligen Rechnungen', hl: true},
    {text: ' und bereite '},
    {text: 'Zahlungserinnerungen', hl: true},
    {text: ' vor.'},
  ] as Seg[],
  buildHeader: '// Reybex KI baut deinen Agenten …',
  buildLines: [
    ['k', 'agent', 'Mahnwesen-Agent'],
    ['k', 'trigger', 'täglich · 07:00'],
    ['s', 'step: sql', 'Offene Posten > 14 Tage überfällig laden'],
    ['c', '  tabelle', 'rechnungen · kunden · zahlungen'],
    ['s', 'step: llm', 'Mahnstufe je Kunde bewerten'],
    ['c', '  output', '{ kunde, betrag, stufe, ton }'],
    ['s', 'step: confirm', 'Freigabe durch Buchhaltung'],
    ['s', 'step: email', 'Zahlungserinnerung (HTML) senden'],
    ['c', '  vorlage', 'freundlich → bestimmt → letzte Mahnung'],
    ['s', 'step: notify', 'Bericht im KI-Aktivitätscenter'],
    ['k', 'status', 'bereit ✓'],
  ] as [string, string, string][],
  card: {
    tabs: ['Übersicht', 'Rechnungen', 'Kunden', 'Agenten'],
    activeTab: 3,
    title: 'Mahnwesen-Agent',
    badge: 'Bereit zur Freigabe',
    subtitle: 'Findet überfällige Rechnungen und bereitet Zahlungserinnerungen vor.',
    // Beispieldaten
    kpis: [
      {value: 12, label: 'überfällige Rechnungen'},
      {value: 8, label: 'Kunden'},
      {value: 3, label: 'Mahnstufen'},
    ],
    flow: ['Daten laden', 'KI-Bewertung', 'Freigabe', 'E-Mail', 'Bericht'],
    schedule: 'Jeden Montag, 08:00 · Bericht an Buchhaltung',
    button: 'Freigeben',
  },
  chips1: ['Buchhaltung', 'Offene Posten'],
  chips2: ['Mahnwesen-Agent'],
  prompt2: [{text: 'Schick mir '}, {text: 'jeden Montag', hl: true}, {text: ' einen Bericht.'}] as Seg[],
  claim: [{text: 'Gebaut mit '}, {text: 'Reybex KI', hl: true}, {text: '.'}] as Seg[],
  subline: 'Reybex KI-ERP',
  url: 'reybex.com/ki-erp',
};
