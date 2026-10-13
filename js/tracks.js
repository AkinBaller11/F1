// Circuit definitions. Plan-view metres (x east, y north), driven clockwise.
// `ctrl` = smooth Catmull-Rom control points, `poly` + `r` = straight segments joined by
// circular corners (street circuits). Layouts are loose interpretations, not surveys.
export const TRACKS = [
  {
    id: 'barcelona', name: 'Barcelona', gp: 'Großer Preis von Spanien', style: 'park', laps: 5,
    info: 'Technisch, schnelle Rechtskurven, Haarnadel',
    ctrl: [[-450,0],[0,0],[450,0],[560,-5],[610,-45],[625,-100],[660,-140],[730,-170],[780,-230],[785,-310],[745,-375],[670,-405],[590,-410],[540,-440],[530,-500],[545,-560],[590,-590],[630,-630],[625,-690],[580,-720],[500,-720],[430,-700],[370,-720],[300,-735],[150,-735],[0,-728],[-150,-720],[-220,-705],[-255,-660],[-265,-560],[-270,-450],[-275,-370],[-285,-320],[-320,-295],[-360,-310],[-375,-350],[-372,-420],[-368,-470],[-380,-530],[-430,-565],[-500,-560],[-560,-530],[-590,-470],[-600,-300],[-600,-150],[-585,-60],[-540,-10]],
  },
  {
    id: 'monza', name: 'Monza', gp: 'Großer Preis von Italien', style: 'forest', laps: 5,
    info: 'Highspeed, lange Geraden, drei Schikanen',
    ctrl: [[-500,0],[0,0],[480,0],[560,0],[610,-18],[660,-26],[710,-10],[770,-2],[850,-25],[915,-80],[952,-160],[965,-250],[965,-290],[985,-330],[1010,-370],[1005,-440],[975,-490],[925,-512],[880,-528],[845,-560],[800,-585],[650,-605],[420,-620],[330,-626],[285,-650],[235,-655],[190,-640],[140,-652],[0,-660],[-300,-665],[-450,-660],[-560,-640],[-640,-590],[-690,-520],[-705,-430],[-700,-320],[-680,-200],[-650,-90],[-600,-20]],
  },
  {
    id: 'city', name: 'Neon City', gp: 'Großer Preis der Stadt', style: 'city', laps: 6,
    info: 'Stadtkurs, Mauern, 90°-Ecken',
    poly: [[-470,0],[680,0],[680,-330],[372,-330],[372,-568],[-200,-568],[-200,-290],[-460,-290]],
    r: [26, 22, 24, 20, 24, 22, 20, 26],
  },
];

export const TIMES = [
  { id: 'morning', name: 'Morgen' },
  { id: 'noon', name: 'Mittag' },
  { id: 'evening', name: 'Abend' },
  { id: 'night', name: 'Nacht' },
];

export const trackById = (id) => TRACKS.find((t) => t.id === id) || TRACKS[0];
