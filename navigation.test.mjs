const fallbackFor = hash => hash.startsWith('#game/') ? '#games' : '#dashboard';

function runScenario(path) {
  let navCurrent = path[0];
  let stack = [];
  for (const next of path.slice(1)) {
    if (next !== navCurrent) {
      if (stack.at(-1) !== navCurrent) stack.push(navCurrent);
      navCurrent = next;
    }
  }
  const backPath = [];
  while (true) {
    let target = null;
    while (stack.length) {
      const candidate = stack.pop();
      if (candidate && candidate !== navCurrent) {
        target = candidate;
        break;
      }
    }
    target ||= fallbackFor(navCurrent);
    if (target === navCurrent) break;
    navCurrent = target;
    backPath.push(navCurrent);
    if (navCurrent === '#dashboard' && stack.length === 0) break;
  }
  return backPath;
}

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    console.error(`FAIL ${label}\nexpected: ${e}\nactual:   ${a}`);
    process.exit(1);
  }
  console.log(`PASS ${label}`);
}

const fullPath = [
  '#dashboard',
  '#games',
  '#calendar',
  '#prices',
  '#issues',
  '#live',
  '#games',
  '#game/steam-test'
];

assertEqual(
  runScenario(fullPath),
  ['#games','#live','#issues','#prices','#calendar','#games','#dashboard'],
  'full route back stack'
);

for (const route of ['#games','#calendar','#prices','#issues','#live']) {
  assertEqual(runScenario([route]), ['#dashboard'], `direct-entry fallback ${route}`);
}

assertEqual(runScenario(['#game/steam-test']), ['#games','#dashboard'], 'direct game-detail fallback');
assertEqual(runScenario(['#dashboard','#calendar','#game/steam-test']), ['#calendar','#dashboard'], 'detail returns to calendar source');
assertEqual(runScenario(['#dashboard','#games','#game/steam-test']), ['#games','#dashboard'], 'detail returns to games source');
