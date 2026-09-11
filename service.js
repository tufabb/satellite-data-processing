//idei generale
//1.compozit sentinel-2 fără nori pe o zonă/interval prin setUpSentinel
//2.detectarea conturului lacului o singură dată prin detecteazaConturLac
//3.indici de calitate a apei la acel contur (NDTI / NDCI / CDOM)
//4.scor aprox de 0-3 "probleme" pe lac sau pe județ prin scorSezon si evalueazaEvolutiaCalitatii

// compozit Sentinel-2 fără nori

/**
 * Combină SCL (clasificare per-pixel) cu Cloud Score+ SCL (Scene Classification Layer) marchează tipul fiecărui pixel.
 * Cloud Score+ dă o probabilitate de ,,e cer senin?" per pixel
 * SCL singur lasă multe haze/umbre nedetectate!!
 * param (ee.Image) image - imagine cu benzile SCL și cs_cdf (adăugată prin linkCollection)
 * return (ee.Image) imaginea cu pixelii de nor/umbră/zăpadă mascați
 */
function maskClouds(image) {
  var scl = image.select('SCL');
  //cele doua masti
  var sclMask = scl.neq(3)    // umbră
    .and(scl.neq(8))          // nor probabilit medie
    .and(scl.neq(9))          // nor probabilit mare
    .and(scl.neq(10))         // cirrus
    .and(scl.neq(11));        // zăpadă/gheață
  var csMask = image.select('cs_cdf').gte(0.4); // prag 
  
  //un pixel trece doar daca trece ambele filtre(AND)
  //OR era prea permisiv
  return image.updateMask(sclMask.and(csMask));
}

/**
 * separam doar zona de interes pe intervalul de interes si aplicam mastile
 * param (ee.Geometry) zona
 * param (string) startDate
 * param (string) endDate
 * return (ee.Image)
 */
function setUpSentinel(zona, startDate, endDate) {
  var csPlus = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(zona)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30)) // elimină zone foarte înnorate
    .linkCollection(csPlus, ['cs_cdf']) //adaugat prin link collection ca e separat cloud score
    .map(maskClouds) //cele doua masti
    .median() //pixel cu pixel, valoare mediana din interval din tot ce a ramas nemascat
    .clip(zona);
}

//detectarea contur lac

/**
 * găsește cel mai mare poligon de apă din zona prin prag MNDWI
 * return contur (ee.Feature), waterMask (ee.Image)
 */
function detectLakeFeature(zona, startDate, endDate) {
  var s2 = setUpSentinel(zona, startDate, endDate);

  // MNDWI = (verde - SWIR)/(verde + SWIR); apa absoarbe SWIR, deci indicele e mare pentru apă
  // prag -0.2 (nu 0) ca să prindă și apă cu alge, care reflectă mai mult verde și scade indicele
  var mndwi = s2.normalizedDifference(['B3', 'B11']).rename('MNDWI');
  
  var waterMask = mndwi.gt(-0.2).selfMask(); //selfMask pastreaza doar pixelii true/nenuli

  var poligoane = waterMask.reduceToVectors({ //transf pixeli in poligoane vectoriale
    reducer: ee.Reducer.countEvery(),
    geometry: zona,
    scale: 10,
    geometryType: 'polygon',
    eightConnected: true,
    bestEffort: true, // reduce rezoluția automat dacă e nevoie
    tileScale: 4       // împarte task-ul pe bucăți mai mici
  }).map(function(f) { return f.set('arie', f.geometry().area(1)); }); // adauga aria fiecarui poligon ca proprietate pt a putea sorta poligoanele

  // lacul e cel mai mare poligon din zonă
  var contur = ee.Feature(poligoane.sort('arie', false).first());
  
  return {contur: contur, waterMask: waterMask};
}

// fereastră fixă ca toti indicii de analiză să folosească exact același contur
var ZILE_FEREASTRA_CONTUR = 45;

/**
 * stabilire start si end date pentru contur
 * param (string) dataRefereinta
 * return {start (string), end (string)}
 */
function ferestraConturLac(dataReferinta) {
  var ref = ee.Date(dataReferinta || Date.now());
  return {
    start: ref.advance(-ZILE_FEREASTRA_CONTUR, 'day').format('YYYY-MM-dd').getInfo(),
    end: ref.advance(1, 'day').format('YYYY-MM-dd').getInfo()
  };
}

/**
 * detectează conturul o singură dată, pe fereastra fixă ca suprafețele comparate să fie identice.
 * CONTURUL SE CALC O SINGURA DAta, indicii folosesc acest contur pe intervale de timp diferite
 * param (ee.Geometry) zona
 * param (string) dataReferinta AN-LUNA-ZI
 * return {contur(ee.Image), conturFeature(ee.Feature)}
 */
function detecteazaConturLac(zona, dataReferinta) {
  var fereastra = ferestraConturLac(dataReferinta);
  var det = detectLakeFeature(zona, fereastra.start, fereastra.end);
  
  var conturMask = ee.Image(1).clip(det.contur.geometry()).updateMask(det.waterMask);
  return {contur: conturMask, conturFeature: det.contur};
}

// indici de calitate a apei

/**
 * NDTI - turbiditate
 * sedimentele reflectă mai mult în roșu (B4) decât verde (B3)
 * wrapper peste calculIndici 
 */
function NDTI(s2, conturMask) {
  return calculIndici(s2).select('NDTI').updateMask(conturMask);
}

/**
 * NDCI - clorofilă/eutrofizare
 * banda red-edge (B5) e sensibilă la clorofilă, formulă standard
 */
function NDCI(s2, conturMask) {
  return calculIndici(s2).select('NDCI').updateMask(conturMask);
}

/**
 * CDOM (proxy materie organică dizolvată) NU E NORMALISEZ DIFF DE BENZI SPECTRALE, e un raport
 * nu există o formulă standard universală pentru acest indice!!!
 */
function CDOM(s2, conturMask) {
  return calculIndici(s2).select('CDOM').updateMask(conturMask);
}

/** Paletă NDTI de culoare
*/
function NDTIvis() {
  return {
    min: -0.2, max: 0.2,
    palette: ['0000ff', '00ffff', '00ff00', 'ffff00', 'ff8000', '7f0000']
  };
}

/** Paletă NDCI */
function NDCIvis() {
  return {
    min: -0.1, max: 0.3,
    palette: ['0000ff', '00ffff', '00ff00', 'ffff00', 'ff0000']
  };
}

/**
 * Paletă CDOM - interval îngustat la 0.75-1.05 unde chiar
 * se afla majoritatea pixelilor reali B2/B3
 * intervalul vechi era prea mare si toate lacurile aveau aceeași culoare
 */
function CDOMvis() {
  return {
    min: 0.75, max: 1.05,
    palette: ['0000ff', '00ffff', '00ff00', 'ffff00', 'ff8000', '7f0000']
  };
}

// wrapper
function imagineSatelit(zona, startDate, endDate) {
  return setUpSentinel(zona, startDate, endDate);
}


// Situatie la nivel de județ, comparație sezonieră, grafice de evoluție

// praguri pentru scorul de probleme(0-3)
// limita superioara acceptata care determina verde/galben/rosu ca indicator de lacuri pe judet
var NDTI_TURBIDITY_THRESHOLD = 0.05;
var NDCI_ALGAE_THRESHOLD = 0.05;
var CDOM_HIGH_THRESHOLD = 1.05;

// definiții de sezon 
var SEZOANE = {
  spring: {label: 'Primăvară', lunaStart: 3, lunaEnd: 5},
  summer: {label: 'Vară', lunaStart: 6, lunaEnd: 8},
  autumn: {label: 'Toamnă', lunaStart: 9, lunaEnd: 11},
  winter: {label: 'Iarnă'} // caz special, vezi getIntervalSezon
};

// culori de grafic per indice: viu (anul selectat) + pal (anul anterior).
var CULORI_INDICI = {
  NDCI: {viu: '2171b5', pal: 'c6dbef'}, // albastru
  NDTI: {viu: 'e31a1c', pal: 'fcbba1'}, // roșu
  CDOM: {viu: '41ab5d', pal: 'c7e9c0'}  // verde
};

/**
 * limite reale de tip [start, end] pentru anotimp + an
 * decembrie aparține anului anterior celui ales de utilizator pentru iarna
 */
function getIntervalSezon(cheieSezon, an) {
  var anNum = Number(an);
  var start, end;
  if (cheieSezon === 'winter') {
    start = ee.Date.fromYMD(anNum - 1, 12, 1);
    end = ee.Date.fromYMD(anNum, 3, 1);
  } else {
    var def = SEZOANE[cheieSezon];
    start = ee.Date.fromYMD(anNum, def.lunaStart, 1);
    end = ee.Date.fromYMD(anNum, def.lunaEnd, 1).advance(1, 'month');
  }
  return {start: start, end: end};
}

/**
 * colecție cloud-masked, NU sub forma de compozit
 * folosită pentru serii temporale/o singură scenă reprezentativă
 */
function buildColectieSentinel(zona, startDate, endDate) {
  var csPlus = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(zona)
    .filterDate(startDate, endDate)
    .linkCollection(csPlus, ['cs_cdf'])
    .map(maskClouds); //fara median si clip!!
}

/**
 * scena cea mai puțin înnorată dintr-un interval doar pentru a raporta o dată reprezentativă (getDateleAnalizate)
 * nu pentru calcul de indici
 */
function celMaiPutinInorat(zona, startDate, endDate) {
  var colectie = buildColectieSentinel(zona, startDate, endDate);
  return ee.Image(colectie.sort('CLOUDY_PIXEL_PERCENTAGE').first());
}

/**
 * mozaic al tuturor scenelor din fereastră, sortate descrescător după procent de nori 
 * mosaic() suprascrie cu ULTIMA imagine din listă care are pixel valid
 * 
 * sortare descrescatoare ca cea mai neinorata scena sa fie ultima (gen layer de sus)
 * scenele inorate stau pe layer de sus doar ca rezerva in cazul in care pixelii din ziua cea mai insorita
 * nu exista/sunt multi nori/nu a trecut satelitul/etc
 * fara el multe zone erau compromise si erau doar stegulete gri pe harta jduetului
*/
function mozaicPutinInorat(zona, startDate, endDate) {
  var colectie = buildColectieSentinel(zona, startDate, endDate)
    .sort('CLOUDY_PIXEL_PERCENTAGE', false);
  return colectie.mosaic();
}


// NDCI/NDTI/CDOM ca 3 benzi ale unei singure imagini
function calculIndici(image) {
  var ndci = image.normalizedDifference(['B5', 'B4']).rename('NDCI');
  var ndti = image.normalizedDifference(['B4', 'B3']).rename('NDTI');
  var cdom = image.select('B2').divide(image.select('B3')).rename('CDOM');
  return ndci.addBands(ndti).addBands(cdom);
}

/**
 * serie temporală NDCI/NDTI/CDOM
 * pentru ui.Chart.image.series în ui
 */
function indiciiPeInterval(zona, contur, startDate, endDate) {
  var colectie = buildColectieSentinel(zona, startDate, endDate);
  return colectie.map(function(img) {
    return calculIndici(img).updateMask(contur).copyProperties(img, ['system:time_start']);
  });
}

/**
 * Un singur indice, perioada curentă vs. aceeași perioadă cu un an în urmă,
 */
function indiciiAnAnAnterior(zona, contur, intervalCurent, intervalAnterior, cheieIndice) {
  var serieCurenta = buildColectieSentinel(zona, intervalCurent.start, intervalCurent.end)
    .map(function(img) {
      return calculIndici(img).select(cheieIndice).updateMask(contur).rename('curent')
        .copyProperties(img, ['system:time_start']);
    });

  var serieAnterioara = buildColectieSentinel(zona, intervalAnterior.start, intervalAnterior.end)
    .map(function(img) {
      var timpMutat = ee.Date(img.get('system:time_start')).advance(1, 'year').millis();
      return calculIndici(img).select(cheieIndice).updateMask(contur).rename('anterior')
        .set('system:time_start', timpMutat);
    });

  return serieCurenta.merge(serieAnterioara);
}

/**
 * Scor de probleme (0-3): câți din cei 3 indici depășesc pragul
 * Un indice invalid (fără pixeli valizi, ex. din cauza norilor) e sărit, nu
 * numărat și nici nu blochează calculul celorlalți doi.
 * semafor vibes
 */
function calculScorProbleme(ndciVal, ndtiVal, cdomVal, ndciValid, ndtiValid, cdomValid) {
  return ee.Number(0)
    .add(ee.Algorithms.If(ndtiValid.and(ndtiVal.gt(NDTI_TURBIDITY_THRESHOLD)), 1, 0))
    .add(ee.Algorithms.If(ndciValid.and(ndciVal.gt(NDCI_ALGAE_THRESHOLD)), 1, 0))
    .add(ee.Algorithms.If(cdomValid.and(cdomVal.gt(CDOM_HIGH_THRESHOLD)), 1, 0));
}

/**
 * Citeste un indice (NDCI/NDTI/CDOM) din dictionarul intors de un reduceRegion (ex. stats.get('NDTI'))
 * daca banda a fost complet innorata, dict.get(key) e null si programul crapa
 * returnam
 * valoare: cea reala sau 0 ca fallback daca lipseste
 * valid: 1 daca a existat cu adevarat, 0 daca lipsea
 * doua concepte pt ca 0 se poate confunda (lipsa de date vs un indice care chiar poate sa fie zero)
 * 
 * folosita in extrageValoriSiValiditate, pentru fiecare din cei 3 indici
 * rezultatul (valoare + valid) merge mai departe la calculScorProbleme, care ignora indicii cu valid=0 la calculul scorului
 */
function citesteIndexSigur(dict, key) {
  var raw = dict.get(key);
  var esteNul = ee.Algorithms.IsEqual(raw, null);
  var valid = ee.Number(ee.Algorithms.If(esteNul, 0, 1));
  return {
    valoare: ee.Number(ee.Algorithms.If(esteNul, 0, raw)),
    valid: valid
  };
}

/**
 * lipsaDate e  folosit pentru a colora gri un romb în UI
 * e adevărat doar când TOȚI cei 3 indici lipsesc
 * dacă măcar unul e valid, se folosește el în loc să se arunce tot punctul
 */
function extrageValoriSiValiditate(stats) {
  var ndci = citesteIndexSigur(stats, 'NDCI');
  var ndti = citesteIndexSigur(stats, 'NDTI');
  var cdom = citesteIndexSigur(stats, 'CDOM');
  var toateLipsa = ndci.valid.not().and(ndti.valid.not()).and(cdom.valid.not());
  return {
    ndci: ndci.valoare, ndti: ndti.valoare, cdom: cdom.valoare,
    ndciValid: ndci.valid, ndtiValid: ndti.valid, cdomValid: cdom.valid,
    lipsaDate: toateLipsa
  };
}

// Tabel de hex + conversie manuală ca din motive pe care nu le stiu da eroare daca fac number.format('%X')
var HEX_DIGITS = ee.List(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F']);

function numberToHex2(number) {
  var n = ee.Number(number).round().max(0).min(255);
  var high = n.divide(16).floor();
  var low = n.mod(16);
  return ee.String(HEX_DIGITS.get(high)).cat(ee.String(HEX_DIGITS.get(low)));
}

function rgbToHexColor(r, g, b) {
  return numberToHex2(r).cat(numberToHex2(g)).cat(numberToHex2(b));
}

/**
 * interpolare pe 2 segmente: verde - galben - roșu
 * segmentată ca să treacă vizibil prin galben la mijloc, nu maro urat cum da la trecere verde - rosu
 */
function interpolateColor(t) {
  t = ee.Number(t).clamp(0, 1);
  var tSeg1 = t.divide(0.5).clamp(0, 1);
  var tSeg2 = t.subtract(0.5).divide(0.5).clamp(0, 1);

  var rSeg1 = ee.Number(0).add(ee.Number(255).multiply(tSeg1));
  var gSeg1 = ee.Number(166).add(ee.Number(215 - 166).multiply(tSeg1));
  var bSeg1 = ee.Number(81).add(ee.Number(0 - 81).multiply(tSeg1));

  var rSeg2 = ee.Number(255).add(ee.Number(204 - 255).multiply(tSeg2));
  var gSeg2 = ee.Number(215).add(ee.Number(0 - 215).multiply(tSeg2));
  var bSeg2 = ee.Number(0);

  var r = ee.Number(ee.Algorithms.If(t.lte(0.5), rSeg1, rSeg2));
  var g = ee.Number(ee.Algorithms.If(t.lte(0.5), gSeg1, gSeg2));
  var b = ee.Number(ee.Algorithms.If(t.lte(0.5), bSeg1, bSeg2));

  return rgbToHexColor(r, g, b);
}

/**
 * delta(gen ca diferenta scor_nou - scor_vechi) între două scoruri de probleme (negativ = îmbunătățire)
 * + culoarea de gradient corespunzătoare (gri dacă nu există date valide).
 * scorul poate sa fie doar intre 0 si 3 ca ori facem +1 la depasire ori +0 cand nu depaseste
 * delta variaza intre -3 si +3, facem scalare pe interval 0,1 ca e mai simplu
 * t mic (delta foarte negativ = mare îmbunătățire), dam verde; 
 * t mare (delta pozitiv = înrăutățire), dam roșu
 * 
 * ex:
 * NDTI_TURBIDITY_THRESHOLD = 0.05
 * NDCI_ALGAE_THRESHOLD    = 0.05
 * CDOM_HIGH_THRESHOLD     = 1.05
 * 
 * scor_vechi de la sapt anterioara
 * NDTI = 0.08   (0.08 > 0.05  depășește pragul deci +1)
 * NDCI = 0.02   (0.02 < 0.05  nu depășește deci +0)
 * CDOM = 1.10   (1.10 > 1.05  depășește pragul deci +1)
 * deci scor_vechi = +2
 * 
 * scor_nou in sapt curenta
 * NDTI = 0.03   (0.03 < 0.05  deci +0)
 * NDCI = 0.02   (0.02 < 0.05  deci +0)
 * CDOM = 1.00   (1.00 < 1.05  deci +0)
 * scor_nou = 0
 * 
 * delta = 0-2=-2 negativ, imbunatatire
 * t = (delta+3)/6 = 0.167 SA NU VA AUD CU 6 7
 * mai aproape de zero deci t mic deci verde deci apa e mai ok
 */
function deltaToColor(scorCurent, scorAnterior, lipsaDate) {
  var delta = scorCurent.subtract(scorAnterior);
  var t = delta.add(3).divide(6).clamp(0, 1); // delta in [-3,3] -> t in [0,1]
  var culoare = ee.Algorithms.If(lipsaDate, '999999', interpolateColor(t));
  return {delta: delta, culoare: culoare};
}

// evaluare saptamanala de trend pe tot judetul
// calcul perioada a sapt de dinainte relativ la data aleasa
function getWeeklyWindows(dataAleasa) {
  var dataAleasaEE = ee.Date(dataAleasa);
  var currentEnd = dataAleasaEE.advance(1, 'day');
  var currentStart = dataAleasaEE.advance(-6, 'day');
  var previousEnd = currentStart;
  var previousStart = currentStart.advance(-7, 'day');
  return {
    currentStart: currentStart, currentEnd: currentEnd,
    previousStart: previousStart, previousEnd: previousEnd
  };
}

/**
 * bucata de monitorizare/de schimbare a culorii romburilor
 * pentru fiecare lac din lacuriFC, calculează scorul de probleme pentru săptămâna curentă și cea anterioară, colorând după TREND (delta):
 * verde=îmbunătățire, galben=neschimbat, roșu=înrăutățire, gri=fără date
 * valide într-una din cele 2 săptămâni.
 *
 * parametrul zona e județul si e folosit doar ca filtru de căutare
 * 
 * ce face nenorocirea
 *1.construieste un mozaic pt saptamana curenta si unul pt cea anterioara, pe toata zona o singura data
 *2.pt fiecare lac citeste media indicilor pe geometria lui, calculeaza cele 2 scoruri si delta.
 *3.daca oricare din cele 2 saptamani nu are date valide, lacul e marcat lipsaDate si colorat gri

 */
function evalueazaEvolutiaCalitatii(zona, lacuriFC, dataAleasa) {
  var ferestre = getWeeklyWindows(dataAleasa);

  var indiciCurenti = calculIndici(mozaicPutinInorat(zona, ferestre.currentStart, ferestre.currentEnd));
  var indiciAnteriori = calculIndici(mozaicPutinInorat(zona, ferestre.previousStart, ferestre.previousEnd));

  return lacuriFC.map(function(lac) {
    var lakeGeometry = lac.geometry();

    var statsCurente = indiciCurenti.reduceRegion({
      reducer: ee.Reducer.mean(), geometry: lakeGeometry, scale: 20,
      maxPixels: 1e9, bestEffort: true, tileScale: 4
    });
    var statsAnterioare = indiciAnteriori.reduceRegion({
      reducer: ee.Reducer.mean(), geometry: lakeGeometry, scale: 20,
      maxPixels: 1e9, bestEffort: true, tileScale: 4
    });

    var valCurente = extrageValoriSiValiditate(statsCurente);
    var valAnterioare = extrageValoriSiValiditate(statsAnterioare);
    var lipsaDate = valCurente.lipsaDate.or(valAnterioare.lipsaDate);

    var scorCurent = calculScorProbleme(valCurente.ndci, valCurente.ndti, valCurente.cdom,
      valCurente.ndciValid, valCurente.ndtiValid, valCurente.cdomValid);
    var scorAnterior = calculScorProbleme(valAnterioare.ndci, valAnterioare.ndti, valAnterioare.cdom,
      valAnterioare.ndciValid, valAnterioare.ndtiValid, valAnterioare.cdomValid);

    var infoDelta = deltaToColor(scorCurent, scorAnterior, lipsaDate);

    var status = ee.Algorithms.If(lipsaDate,
      'Fără date valide într-una din cele 2 săptămâni (nori)',
      ee.String('Scor ').cat(scorAnterior.format('%d')).cat(' -> ').cat(scorCurent.format('%d'))
        .cat(ee.Algorithms.If(infoDelta.delta.lt(0), ' (îmbunătățire)',
          ee.Algorithms.If(infoDelta.delta.gt(0), ' (înrăutățire)', ' (neschimbat)'))));

    return lac.set({
      ndci_curent: valCurente.ndci, ndti_curent: valCurente.ndti, cdom_curent: valCurente.cdom,
      ndci_anterior: valAnterioare.ndci, ndti_anterior: valAnterioare.ndti, cdom_anterior: valAnterioare.cdom,
      scor_curent: scorCurent, scor_anterior: scorAnterior, delta: infoDelta.delta,
      culoare: infoDelta.culoare, status: status
    });
  });
}

/**
 * datele exacte ale celor 2 scene folosite pentru evaluarea pe județ, ca utilizatorul să vadă ce 2 zile s-au comparat efectiv
 * gen 5 martie vs 12 martie
 */
function getDateleAnalizate(zona, dataAleasa) {
  var ferestre = getWeeklyWindows(dataAleasa);
  var imgCurenta = celMaiPutinInorat(zona, ferestre.currentStart, ferestre.currentEnd);
  var imgAnterioara = celMaiPutinInorat(zona, ferestre.previousStart, ferestre.previousEnd);
  return ee.Dictionary({
    dataCurenta: imgCurenta.date().format('YYYY-MM-dd'),
    dataAnterioara: imgAnterioara.date().format('YYYY-MM-dd')
  });
}

/**
 * scor de probleme + valorile medii ale indicilor pentru UN singur lac pe (start, end)
 * contur e conturul independent din detecteazaConturLac
 */
function scorSezon(zona, contur, start, end) {
  var s2 = setUpSentinel(zona, start, end);
  var indici = calculIndici(s2).updateMask(contur);

  var stats = indici.reduceRegion({
    reducer: ee.Reducer.mean(), geometry: zona, scale: 10, maxPixels: 1e9, bestEffort: true, tileScale: 4
  });

  var valori = extrageValoriSiValiditate(stats);
  var scor = calculScorProbleme(valori.ndci, valori.ndti, valori.cdom,
    valori.ndciValid, valori.ndtiValid, valori.cdomValid);

  return {ndci: valori.ndci, ndti: valori.ndti, cdom: valori.cdom, scor: scor, lipsaDate: valori.lipsaDate};
}

// API public
//tot de mai sus rămâne privat pentru composite/service

exports.imagineSatelit = imagineSatelit;
exports.detecteazaConturLac = detecteazaConturLac;
exports.NDTI = NDTI;
exports.NDCI = NDCI;
exports.CDOM = CDOM;
exports.NDTIvis = NDTIvis;
exports.NDCIvis = NDCIvis;
exports.CDOMvis = CDOMvis;

exports.SEZOANE = SEZOANE;
exports.getIntervalSezon = getIntervalSezon;
exports.scorSezon = scorSezon;
exports.indiciiPeInterval = indiciiPeInterval;
exports.indiciiAnAnAnterior = indiciiAnAnAnterior;
exports.evalueazaEvolutiaCalitatii = evalueazaEvolutiaCalitatii;
exports.getDateleAnalizate = getDateleAnalizate;
exports.deltaToColor = deltaToColor;
exports.CULORI_INDICI = CULORI_INDICI;
exports.NDTI_TURBIDITY_THRESHOLD = NDTI_TURBIDITY_THRESHOLD;
exports.NDCI_ALGAE_THRESHOLD = NDCI_ALGAE_THRESHOLD;
exports.CDOM_HIGH_THRESHOLD = CDOM_HIGH_THRESHOLD;