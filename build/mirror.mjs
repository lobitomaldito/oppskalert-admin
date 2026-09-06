// Et element (eller en forelder) kan baere data-content-src="annenSide" for aa
// hente innholdet sitt fra en annen sides JSON. Da har speilet innhold en enkelt
// eier, og en endring ett sted viser likt overalt.
//
// lastInnhold injiseres slik at modulen aldri roerer filsystemet selv. Det er
// det som gjoer den testbar uten aa skrive filer.
export function lagOppslag(sideInnhold, lastInnhold) {
  const cache = Object.create(null);

  return function slaOpp(el, nokkel) {
    let node = el;
    while (node) {
      const kilde = node.getAttribute && node.getAttribute('data-content-src');
      if (kilde) {
        if (!(kilde in cache)) cache[kilde] = lastInnhold(kilde) || {};
        return cache[kilde][nokkel];
      }
      node = node.parentNode;
    }
    return sideInnhold[nokkel];
  };
}
