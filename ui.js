var service = require('users/monicadima241627/satellite:composite');

// selecția de 4 puncte care doar delimitează un poligon
// analiza rulează separat pe butoanele din panel stanga

//elementele vizuale adaugate pe harta sunt tinute in variabile ca sa putem sa le stergem usor

var clickedPoints = [];     //cele 4 puncte alese de user pe harta

//referințele la layerele cu puncte roșii de pe hartă pentru fiecare punct
//ținute separat ca să poată fi șterse individual la UNDO
var layerPoints = [];    

//layerele generate de o analiză de ex contur, indici
//șterse complet la fiecare rulare sau analiza nouă
var lakeLayer = [];        
var currentLegendPanel = null; //legenda cu gradient de pe harta pentru indici(min/max)

// starea ACTIVA/DEZACTIVATA pentru butoane
var CULOARE_TEXT_DEZACTIVAT = '#bbbbbb'; // text gri deschis cand butonul e dezactivat
var CULOARE_FUNDAL_DEZACTIVAT = '#ffffff'; // identic cu fundalul panoului

var STIL_BUTON_PRIMAR = {
  backgroundColor: '#ffffff', color: 'black', fontWeight: 'bold',
  border: '0', padding: '8px 10px', margin: '4px 0', stretch: 'horizontal'
};

// cele 3 butoane de analiza
var STIL_BUTON_ANALIZA = {
  backgroundColor: '#ffffff', color: 'black', fontWeight: 'bold',
  border: '0', padding: '5px 10px', margin: '0', stretch: 'horizontal'
};

// baza comuna pentru butoanele secundare
var STIL_BUTON_SECUNDAR_BAZA = {
  backgroundColor: '#ffffff', color: 'black', fontWeight: 'bold',
  border: '0', padding: '6px 10px', width: '100px'
};
var STIL_BUTON_SECUNDAR = Object.assign({}, STIL_BUTON_SECUNDAR_BAZA, {margin: '4px 4px 4px 0'});
var STIL_BUTON_PERICOL = Object.assign({}, STIL_BUTON_SECUNDAR_BAZA, {margin: '4px 0'});

// baza comuna pentru butoanele mici
var STIL_BUTON_MIC_BAZA = {
  backgroundColor: 'rgba(0,0,0,0)', color: 'black', fontWeight: 'bold',
  border: '0', stretch: 'horizontal'
};
var STIL_BUTON_MIC = Object.assign({}, STIL_BUTON_MIC_BAZA, {margin: '2px'});
var STIL_BUTON_STERGE = Object.assign({}, STIL_BUTON_MIC_BAZA, {margin: '6px 0 0 0'});

// stari explicite activat/dezactivat, refolosite pentru orice buton conditionat
// vizual dezactivat (fundal + text decolorate) fata de starea normala
var STIL_BUTON_ACTIV = {
  backgroundColor: '#ffffff', color: 'black', fontWeight: 'bold',
  border: '0', height: '30px', padding: '0 10px', margin: '0', stretch: 'horizontal'
};
var STIL_BUTON_DEZACTIVAT = {
  backgroundColor: CULOARE_FUNDAL_DEZACTIVAT, color: CULOARE_TEXT_DEZACTIVAT, fontWeight: 'bold',
  border: '0', height: '30px', padding: '0 10px', margin: '0', stretch: 'horizontal'
};

var STIL_BUTON_OK_ACTIV = {
  backgroundColor: '#ffffff', color: 'black', fontWeight: 'bold',
  border: '0', padding: '6px 10px', margin: '4px 4px 4px 0', width: '100px'
};
var STIL_BUTON_OK_DEZACTIVAT = {
  backgroundColor: CULOARE_FUNDAL_DEZACTIVAT, color: CULOARE_TEXT_DEZACTIVAT, fontWeight: 'bold',
  border: '0', padding: '6px 10px', margin: '4px 4px 4px 0', width: '100px'
};
// stiluri pentru butoanele de indici (NDTI/NDCI/CDOM)
// starea ACTIVA/INACTIVA se vede doar din text (bold + culoare albastra cand e activ)
var CULOARE_INDICE_ACTIV = '#1a73e8';
var STIL_BUTON_INDICE_ACTIV = {
  backgroundColor: 'rgba(0,0,0,0)', color: CULOARE_INDICE_ACTIV, fontWeight: 'bold',
  border: '0', padding: '6px 10px', margin: '2px', stretch: 'horizontal'
};
var STIL_BUTON_INDICE_INACTIV = {
  backgroundColor: 'rgba(0,0,0,0)', color: 'black', fontWeight: 'normal',
  border: '0', padding: '6px 10px', margin: '2px', stretch: 'horizontal'
};

//linie separatoare sectiuni principale
function linieSeparatoare() {
  return ui.Panel({style: {backgroundColor: 'd0d0d0', height: '1px', margin: '8px 0', stretch: 'horizontal'}});
}

// culorile romburilor din evaluarea calitatii apei
// verde = mai bine, galben = la fel, rosu = mai rau
// gri = date insuficiente gen lac fara pixeli valizi in una din cele 2 saptamani (cu nori)
var CULOARE_LEGENDA_MAI_BINE = '2ecc71';
var CULOARE_LEGENDA_LA_FEL = 'f1c40f';
var CULOARE_LEGENDA_MAI_RAU = 'e74c3c';
var CULOARE_LEGENDA_DATE_INSUFICIENTE = '999999';

// intervalul comparat de evaluarea calitatii apei la nivel de judet (romburile)
// afisat sub legenda, ca sa fie clar la ce interval se raporteaza culorile
var ZILE_EVALUARE_JUDET = 7;

//legenda culori pentru evaluare
function bulinaLegenda(culoareHex, text) {
  var patratel = ui.Label('', {
    backgroundColor: culoareHex, color: culoareHex,
    margin: '2px 4px 2px 0', padding: '0', width: '10px', height: '10px'
  });
  var eticheta = ui.Label(text, {fontSize: '11px', fontWeight: 'bold', color: '222222', margin: '0 10px 0 0'});
  return ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    widgets: [patratel, eticheta],
    style: {margin: '0'}
  });
}

//legenda afisata sub statusul de judet mediat ce evaluarea calitatii apei s-a terminat
//construita o singura data in setupPanel(), ascunsa (shown:false) pana la primul rezultat

function LegendaCalitateApaPanel() {
  var panel = ui.Panel({
    style: {margin: '2px 0 0 0', shown: false}
  });
  var randBuline = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {margin: '0'}
  });
  randBuline.add(bulinaLegenda(CULOARE_LEGENDA_MAI_BINE, 'Îmbunătățire'));
  randBuline.add(bulinaLegenda(CULOARE_LEGENDA_LA_FEL, 'Stagnare'));
  randBuline.add(bulinaLegenda(CULOARE_LEGENDA_MAI_RAU, 'Înrăutățire'));
  panel.add(randBuline);
  panel.add(bulinaLegenda(CULOARE_LEGENDA_DATE_INSUFICIENTE, 'Date insuficiente'));
  panel.add(ui.Label(
    'Raportat la o analiză a ultimelor ' + ZILE_EVALUARE_JUDET + ' zile.',
    {fontSize: '10px', color: '888888', margin: '1px 0 0 0'}
  ));
  return panel;
}

//tutoriale mici, afisate in panoul din dreapta cat timp nu exista inca un rezultat de aratat 
var STIL_TEXT_TUTORIAL = {fontSize: '12px', color: '444444', whiteSpace: 'pre-wrap', margin: '8px'};


function textTutorial(titlu, pasi, atentionari) {
  var linii = [titlu, ''];
  pasi.forEach(function(text, i) { linii.push((i + 1) + '. ' + text); });
  if (atentionari) {
    if (typeof atentionari === 'string') atentionari = [atentionari];
    linii.push('');
    linii.push('ATENȚIE');
    atentionari.forEach(function(text) { linii.push(text); });
  }
  return ui.Label(linii.join('\n'), STIL_TEXT_TUTORIAL);
}

//indicator animat de tip clepsidră pentru status-urile care asteapta un raspuns 
//ascuns cat timp nu ruleaza nimic si aratat doar in timpul operatiei
var CLEPSIDRA_CADRE = ['◐', '◓', '◑', '◒'];
var CLEPSIDRA_INTERVAL_MS = 200;
var CLEPSIDRA_STIL = {fontSize: '15px', fontWeight: 'bold', margin: '-2px 0 0 6px', color: '444444'};

function creeazaClepsidra() {
  var stil = {
    fontSize: CLEPSIDRA_STIL.fontSize, fontWeight: CLEPSIDRA_STIL.fontWeight,
    margin: CLEPSIDRA_STIL.margin, color: CLEPSIDRA_STIL.color, shown: false
  };
  return ui.Label({value: CLEPSIDRA_CADRE[0], style: stil});
}

// arata spinnerul si porneste animatia
// schimba cadrul la fiecare CLEPSIDRA_INTERVAL_MS
function porneClepsidra(spinner) {
  if (!spinner) return;
  opresteClepsidra(spinner);
  spinner.style().set('shown', true);
  spinner._clepsidraActiva = true;
  spinner._clepsidraFrame = 0;
  (function tick() {
    if (!spinner._clepsidraActiva) return;
    spinner.setValue(CLEPSIDRA_CADRE[spinner._clepsidraFrame % CLEPSIDRA_CADRE.length]);
    spinner._clepsidraFrame++;
    spinner._clepsidraTimeoutId = ui.util.setTimeout(tick, CLEPSIDRA_INTERVAL_MS);
  })();
}

// ascunde spinnerul si opreste animatia
function opresteClepsidra(spinner) {
  if (!spinner) return;
  spinner._clepsidraActiva = false;
  spinner.style().set('shown', false);
  if (spinner._clepsidraTimeoutId) {
    ui.util.clearTimeout(spinner._clepsidraTimeoutId);
    spinner._clepsidraTimeoutId = null;
  }
}

// helpere de status
// setStatus scrie un mesaj final si opreste clepsidra
// setStatusLoading scrie mesajul de asteptare si porneste clepsidra
// fiecare status (judet / analiza) are propria clepsidra

function setStatus(label, mesaj, spinner) {
  opresteClepsidra(spinner);
  if (label) label.setValue(mesaj);
}
function setStatusLoading(label, mesaj, spinner) {
  if (label) label.setValue(mesaj);
  porneClepsidra(spinner);
}

// setare date
var nowJS = new Date();
var defaultEndDate = nowJS.getFullYear() + '-' +
  String(nowJS.getMonth() + 1).padStart(2, '0') + '-' +
  String(nowJS.getDate()).padStart(2, '0');

// data pe baza careia ruleaza cele 3 analize (ziua exacta / ultimele 30 zile / sezonul)
var dataLacAleasa = defaultEndDate;

// conturul lacului calculat o singura data prin selectie de 4 puncte
// refolosit de toate cele 3 analize, ca sa nu recalculam de 3 ori acelasi lucru
var conturLacCache = null;

// judete + HydroLAKES + lacuri adaugate de user

var COUNTIES_FC = ee.FeatureCollection('FAO/GAUL/2015/level1')
  .filter(ee.Filter.eq('ADM0_NAME', 'Romania'));

var HYDROLAKES = ee.FeatureCollection('projects/sat-io/open-datasets/HydroLakes/lake_poly_v10');

var currentCountyGeometry = null; //geometrie judet ales
var userLakes = [];          // {nume, lat, lon, raza} pentru lacuri adaugate
var lakeList = [];           // lista lacurilor judetului curent, colorata dupa evaluare
var lakePointsFC = null;
var lakePointsLayer = null;  // layerul romburilor judetului

// adaugare lac: butonul principal deschide o caseta (nume + alege punct + OK/Renunta),
// caseta ramane ascunsa (style shown:false) pana se apasa Adaugă lac
var isPickingLakePoint = false;   // true doar cat timp asteptam click-ul pe harta pentru noul lac
var pendingLakePoint = null;      // {lat, lon} ales pe harta, inainte de a apasa OK
var pendingLakePointLayer = null; // marcaj temporar pe harta pt punctul ales, sters la OK/Renunta
var addLakeButton = null;         // butonul principal Adaugă lac
var addLakeBoxPanel = null;       // caseta cu numele + alegere punct + OK/Renunta
var lakeNameInput = null;
var pickPointButton = null;
var okAddLakeButton = null;
var addLakeStatusLabel = null;

// eticheta butonului de alegere a punctului, in cele 3 stari posibile:
// - inainte sa fi fost ales vreun punct
// - cat timp asteptam click-ul pe harta
// - dupa ce exista deja un punct ales (userul poate da click din nou ca sa il schimbe)
var LABEL_ALEGE_PUNCT = 'Alege punctul pe hartă';
var LABEL_ALEGERE_ARMATA = 'Click pe hartă pentru a alege locația';
var LABEL_SCHIMBA_PUNCT = 'Schimbă punctul pe hartă';

var USER_LAKE_RADIUS_M = 100; // raza fixa pt. lacurile adaugate manual (doar puncte, nu poligoane)

// status separat pentru cele doua fluxuri independente ale panoului:
// - statusLabelJudet: judet / lista de lacuri / evaluare calitate apa
// - statusLabelAnaliza: cele 4 puncte + cele 3 analize pe lacul definit de ele
// separate ca sa nu se suprascrie intre ele cand ambele fluxuri ruleaza

var statusLabelJudet = null;
var statusLabelAnaliza = null;
var statusSpinnerJudet = null;    // clepsidra status
var statusSpinnerAnaliza = null;  // clepsidra status analiză
var legendaCalitateApaPanel = null; // legenda cu cele 3 culori (verde/galben/rosu), aratata dupa evaluare completă

var selectedDate = defaultEndDate; // data de referinta pentru evaluarea la nivel de judet

var chartPanel = null;
// doua tutoriale, cate unul pentru fiecare din cele doua sectiuni din panoul din stanga 
// stau afisate constant in panoul din dreapta pana cand una din cele 3 analize  produce rezultate

var chartPlaceholderJudet = null;
var chartPlaceholderAnaliza = null;
//flag afisare tutoriale
var arataTutorial = true;

var indiciCheckboxPanel = null;
var ndtiToggleButton = null;
var ndciToggleButton = null;
var cdomToggleButton = null;
var indiciCheckboxState = {ndti: false, ndci: false, cdom: false}; // default: toate butoanele oprite initial

// timelapse cu layere de thumbnail animat de pe harta + panoul cu cele 3 butoane
var timelapseThumbnails = [];   // ui.Thumbnail-urile adaugate pe harta, ca sa poata fi sterse cu un buton
var timelapseRequestId = 0; // numarul cererii curente de timelapse, ca un raspuns intarziat de la o cerere veche sa nu mai apara peste una noua

// selector de data (zi/luna/an), comun pentru cele 2 widgets din panel

var LUNI = [
  {label:'Ianuarie',number:'01'},{label:'Februarie',number:'02'},{label:'Martie',number:'03'},
  {label:'Aprilie',number:'04'},{label:'Mai',number:'05'},{label:'Iunie',number:'06'},
  {label:'Iulie',number:'07'},{label:'August',number:'08'},{label:'Septembrie',number:'09'},
  {label:'Octombrie',number:'10'},{label:'Noiembrie',number:'11'},{label:'Decembrie',number:'12'}
];
var ETICHETE_LUNI = LUNI.map(function(l){ return l.label; });

// transformare numar la nume luna
function lunaLabelDinNumar(numar) {
  var gasit = LUNI.filter(function(l){ return l.number === numar; })[0];
  return gasit ? gasit.label : 'Ianuarie';
}
// transformare nume luna la numar
function lunaNumarDinLabel(label) {
  var gasit = LUNI.filter(function(l){ return l.label === label; })[0];
  return gasit ? gasit.number : '01';
}

var ANUL_CURENT = new Date().getFullYear();
var ANI_DISPONIBILI = [];
for (var anIt = 2019; anIt <= ANUL_CURENT; anIt++) ANI_DISPONIBILI.push(String(anIt));

var ZILE_DISPONIBILE = [];
for (var ziIt = 1; ziIt <= 31; ziIt++) ZILE_DISPONIBILE.push(ziIt < 10 ? '0' + ziIt : String(ziIt));

//construieste meniu de alegere data din 3 dropdownuri (zi/luna/an)
function creeazaRandData(dataInitiala, onSchimbare) {
  var parti = dataInitiala.split('-');
  var an = parti[0], zi = parti[2];
  var lunaLabel = lunaLabelDinNumar(parti[1]);

  function valoareCurenta() {
    return an + '-' + lunaNumarDinLabel(lunaLabel) + '-' + zi;
  }
  function notifica() {
    if (onSchimbare) onSchimbare(valoareCurenta());
  }

  var randData = ui.Panel({layout: ui.Panel.Layout.flow('horizontal'), style: {stretch: 'horizontal'}});
  var ziSelect = ui.Select({items: ZILE_DISPONIBILE, value: zi, style: {stretch: 'horizontal'},
    onChange: function(v){ zi = v; notifica(); }});
  var lunaSelect = ui.Select({items: ETICHETE_LUNI, value: lunaLabel, style: {stretch: 'horizontal'},
    onChange: function(v){ lunaLabel = v; notifica(); }});
  var anSelect = ui.Select({items: ANI_DISPONIBILI, value: an, style: {stretch: 'horizontal'},
    onChange: function(v){ an = v; notifica(); }});

  randData.add(ziSelect);
  randData.add(lunaSelect);
  randData.add(anSelect);

  return {panel: randData, getValue: valoareCurenta};
}

//exceptie decembrie apartine sezonului de iarna al anului URMATOR 
function determinaSezonSiAn(dataStr) {
  var parti = dataStr.split('-');
  var an = Number(parti[0]);
  var luna = Number(parti[1]);
  var cheieSezon, anSezon;
  if (luna >= 3 && luna <= 5) { cheieSezon = 'spring'; anSezon = an; }
  else if (luna >= 6 && luna <= 8) { cheieSezon = 'summer'; anSezon = an; }
  else if (luna >= 9 && luna <= 11) { cheieSezon = 'autumn'; anSezon = an; }
  else { cheieSezon = 'winter'; anSezon = (luna === 12) ? an + 1 : an; }
  return {cheieSezon: cheieSezon, an: anSezon};
}

// helpere mici

// distanta haversine gen distanța pe sferă între două puncte geografice, în metri
// R e raza medie a pamantului, fun math stuff

function haversineDistance(lat1, lon1, lat2, lon2) {
  var R = 6371000;
  var toRad = function(deg) { return deg * Math.PI / 180; };
  var dLat = toRad(lat2 - lat1);
  var dLon = toRad(lon2 - lon1);
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// leaga rezultatele evaluarii de obiectele din lakeList
function findClosest(lat, lon, list, maxDist) {
  var best = null;
  var bestDist = Infinity;
  list.forEach(function(item) {
    var d = haversineDistance(lat, lon, item.lat, item.lon);
    if (d < bestDist) { bestDist = d; best = item; }
  });
  if (best && bestDist < maxDist) return best;
  return null;
}

// un punct pe lac din lakeList, colorat dupa evaluarea curenta
function buildStyledPointsFC() {
  if (!lakeList || lakeList.length === 0) return null;
  var features = lakeList.map(function(p) {
    return ee.Feature(ee.Geometry.Point([p.lon, p.lat]), {
      style: {color: p.color || '1E90FF', pointShape: 'diamond', pointSize: 8, width: 1}
    });
  });
  return ee.FeatureCollection(features);
}

// lacurile adaugate de user sunt doar puncte fara poligon
// primesc un buffer de raza fixa ca sa existe o arie pe care sa poata face calcule (reduceRegion de ex), la fel ca lacurile din HydroLAKES.
function buildUserLakesFC() {
  if (userLakes.length === 0) return null;
  var features = userLakes.map(function(l) {
    var geom = ee.Geometry.Point([l.lon, l.lat]).buffer(l.radius);
    return ee.Feature(geom, {name: l.name, area_m2: geom.area(1), source: 'User added'});
  });
  return ee.FeatureCollection(features);
}

// filtreaza pe conturul exact al judetului
function buildAllLakePolygons() {
  var bigLakes = HYDROLAKES.filterBounds(currentCountyGeometry).map(function(f) {
    return f.set('name', f.get('Lake_name'))
      .set('area_m2', ee.Number(f.get('Lake_area')).multiply(1e6)) // km2 -> m2
      .set('source', 'HydroLAKES');
  });
  var userLakesFC = buildUserLakesFC();
  return userLakesFC ? bigLakes.merge(userLakesFC) : bigLakes;
}

// goleste panoul din dreapta si, daca tutorialul e activ, pune la loc cele 2 placeholdere de tutorial
function clearChartPanel() {
  if (!chartPanel) return;
  chartPanel.clear();
  if (chartPlaceholderJudet && arataTutorial) chartPanel.add(chartPlaceholderJudet);
  if (chartPlaceholderAnaliza && arataTutorial) chartPanel.add(chartPlaceholderAnaliza);
}

// forteaza recalculul conturului la urmatorul obtineConturLac (punct nou/UNDO/schimbare zi)
function invalideazaConturLac() {
  conturLacCache = null;
}

// hehe memoizare mentioned
//conturul lacului consuma resurse asa ca e cache-uit pana la urmatoarea invalideazaConturLac()
function obtineConturLac(zona) {
  if (!conturLacCache) {
    conturLacCache = service.detecteazaConturLac(zona, dataLacAleasa);
  }
  return conturLacCache;
}

//sterge toate thumbnail-urile de timelapse de pe harta 
//buton Sterge timelapse
function clearTimelapse() {
  if (timelapseThumbnails.length > 0) {
    timelapseThumbnails.forEach(function(thumb) { Map.remove(thumb); });
    timelapseThumbnails = [];
  }
}

// reseteaza tot ce tine de selectia manuala de 4 puncte
// functie apelata de butonul reset
function clearAnalysisState() {
  arataTutorial = true;
  invalideazaConturLac();
  if (lakeLayer.length > 0) {
    lakeLayer.forEach(function(layer) { Map.layers().remove(layer); });
    lakeLayer = [];
  }
  if (layerPoints.length > 0) {
    layerPoints.forEach(function(layer) { Map.layers().remove(layer); });
    layerPoints = [];
  }
  clickedPoints = [];
  if (currentLegendPanel) { Map.remove(currentLegendPanel); currentLegendPanel = null; }
  clearTimelapse();
  clearChartPanel();
  ultimaAnalizaZi = null; 
}

// redeseneaza doar romburile lacurilor din judetului
//sterge layer vechi si creeaza unul nou
function renderPreview() {
  if (lakePointsLayer) { Map.layers().remove(lakePointsLayer); lakePointsLayer = null; }
  if (lakePointsFC) {
    lakePointsLayer = ui.Map.Layer(lakePointsFC.style({styleProperty: 'style'}), {}, 'Corpuri de apă');
    Map.layers().add(lakePointsLayer);
  }
}

// incarca lista de lacuri a judetului

function reloadLakeList() {
  if (!currentCountyGeometry) return;
  setStatusLoading(statusLabelJudet, 'Se încarcă lista de lacuri...', statusSpinnerJudet);

  var allPolygons = buildAllLakePolygons();

  var points = allPolygons.map(function(f) {
    return ee.Feature(f.geometry().centroid(1), {
      name: f.get('name'), area_m2: f.get('area_m2'), source: f.get('source')
    });
  });

  points.evaluate(function(fc, err) {
    if (err) {
      print('Eroare la încărcarea lacurilor:', err);
      setStatus(statusLabelJudet, 'Eroare la încărcare. Vezi consola.', statusSpinnerJudet);
      return;
    }
    lakeList = fc.features.map(function(feat) {
      return {
        lon: feat.geometry.coordinates[0],
        lat: feat.geometry.coordinates[1],
        area: feat.properties.area_m2,
        name: feat.properties.name || '(nedenumit)',
        source: feat.properties.source,
        color: '1E90FF'
      };
    });
    lakePointsFC = buildStyledPointsFC();
    setStatus(statusLabelJudet, 'Au fost găsite ' + lakeList.length + ' lacuri.', statusSpinnerJudet);
    renderPreview();
  });
}

//apelata la schimbarea judetului din countySelect
//reseteaza tot ce apartinea judetului anterior gen lacuri adaugate manual, caseta de adaugare, analiza
//reincarca lista de lacuri pentru cel nou

function switchCounty(name) {
  var feature = ee.Feature(COUNTIES_FC.filter(ee.Filter.eq('ADM1_NAME', name)).first());
  currentCountyGeometry = feature.geometry();

  userLakes = []; // lacurile adaugate manual n-au sens transferate la alt judet
  inchideCasetaAdaugareLac(); // orice adaugare de lac in curs pentru judetul vechi nu mai are sens
  setStareButon(addLakeButton, true); // are sens abia acum, cand exista un judet in care sa fie adaugat lacul
  clearAnalysisState();
  // legenda de evaluare apartinea judetului anterior - ascunsa pana la o noua evaluare
  if (legendaCalitateApaPanel) legendaCalitateApaPanel.style().set('shown', false);

  Map.centerObject(feature);
  reloadLakeList();
}

//evalueaza cum s-a schimbat calitatea apei (saptamana ce se termina la
// selectedDate vs saptamana dinainte) pentru fiecare lac din judet, si
//recoloreaza romburile: verde = mai bine, galben = la fel, rosu = mai rau.

function evaluateWaterQualityTrend() {
  if (!currentCountyGeometry) {
    print('Alege mai întâi un județ.');
    setStatus(statusLabelJudet, 'Alege mai întâi un județ.', statusSpinnerJudet);
    return;
  }
  if (!selectedDate) {
    setStatus(statusLabelJudet, 'Alege o dată de referință și încearcă din nou.', statusSpinnerJudet);
    return;
  }

  arataTutorial = false; // ascunde tutorialul
  clearChartPanel();

  // legenda apartine evaluarii anterioare, asa ca e ascunsa cat timp se recalculeaza
  if (legendaCalitateApaPanel) legendaCalitateApaPanel.style().set('shown', false);
  setStatusLoading(statusLabelJudet, 'Se calculează evoluția calității apei...', statusSpinnerJudet);

  var allPolygons = buildAllLakePolygons();
  var evaluated = service.evalueazaEvolutiaCalitatii(currentCountyGeometry, allPolygons, selectedDate);
  var evaluatedPoints = evaluated.map(function(f) {
    return ee.Feature(f.geometry().centroid(1), {
      color: f.get('culoare'), status: f.get('status'),
      currentScore: f.get('scor_curent'), previousScore: f.get('scor_anterior'), delta: f.get('delta')
    });
  });

  // doar informativ, arata exact ce doua date s-au comparat
  // saptamana trecuta nu inseamna mereu exact 7 zile in urma :)) depinde de cea mai apropiata scena fara nori
  service.getDateleAnalizate(currentCountyGeometry, selectedDate).evaluate(function(dateInfo, errDate) {
    if (!errDate && dateInfo) {
      print('Comparație: ' + dateInfo.dataAnterioara + ' (săptămâna trecută) -> ' + dateInfo.dataCurenta + ' (săptămâna curentă)');
    }
  });

  evaluatedPoints.evaluate(function(fc, err) {
    if (err) {
      print('Evaluarea evoluției calității apei a eșuat:', err);
      setStatus(statusLabelJudet, 'Eroare la evaluare. Vezi consola.', statusSpinnerJudet);
      return;
    }
    fc.features.forEach(function(feat) {
      var lon = feat.geometry.coordinates[0];
      var lat = feat.geometry.coordinates[1];
      var match = findClosest(lat, lon, lakeList, 200);
      if (match) { match.color = feat.properties.color; match.status = feat.properties.status; }
    });
    lakePointsFC = buildStyledPointsFC();
    setStatus(statusLabelJudet, 'Evaluare completă.', statusSpinnerJudet);
    if (legendaCalitateApaPanel) legendaCalitateApaPanel.style().set('shown', true);
    print('Evaluare evoluție calitate apă completă pentru', lakeList.length, 'corpuri de apă.');
    renderPreview();
  });
}

// finalizeaza adaugarea unui lac nou: ia numele din caseta si punctul ales pe harta
//il adauga in lista userului, apoi reincarca totul (HydroLAKES + user)
//tine doar pt sesiunea curenta, se pierde la  refresh
// apelata de butonul OK din caseta de adaugare lac
 
function confirmaAdaugareLac() {
  if (!pendingLakePoint) return; // OK e dezactivat pana nu exista un punct ales

  var name = lakeNameInput ? (lakeNameInput.getValue() || '').trim() : '';
  if (!name) {
    if (addLakeStatusLabel) addLakeStatusLabel.setValue('Completează numele lacului înainte de a continua.');
    return;
  }
  userLakes.push({name: name, lat: pendingLakePoint.lat, lon: pendingLakePoint.lon, radius: USER_LAKE_RADIUS_M});

  inchideCasetaAdaugareLac();
  reloadLakeList(); // reincarcare completa
}

//(de)activeaza vizual un buton pe langa disabled (care blocheaza click-ul)
//schimba si stilul (fundal/text mai deschise cat timp e dezactivat)
function setStareButon(buton, activat) {
  if (!buton) return;
  buton.setDisabled(!activat);
  buton.style().set(activat ? STIL_BUTON_ACTIV : STIL_BUTON_DEZACTIVAT);
}

// varianta lui setStareButon pt butonul OK (are parametri diferiti gen STIL_BUTON_ACTIV vs STIL_BUTON_OK_ACTIV)
function setStareButonOK(activat) {
  if (!okAddLakeButton) return;
  okAddLakeButton.setDisabled(!activat);
  okAddLakeButton.style().set(activat ? STIL_BUTON_OK_ACTIV : STIL_BUTON_OK_DEZACTIVAT);
}

//ascunde si reseteaza caseta de adaugare lac 
// apelata atat dupa OK cat si de butonul Renunta

function inchideCasetaAdaugareLac() {
  pendingLakePoint = null;
  isPickingLakePoint = false;
  if (pendingLakePointLayer) { Map.layers().remove(pendingLakePointLayer); pendingLakePointLayer = null; }
  if (lakeNameInput) lakeNameInput.setValue('');
  if (pickPointButton) pickPointButton.setLabel(LABEL_ALEGE_PUNCT);
  setStareButonOK(false);
  if (addLakeStatusLabel) addLakeStatusLabel.setValue('');
  if (addLakeBoxPanel) addLakeBoxPanel.style().set('shown', false);
}

function AdaugaLacBoxPanel() {
  var box = ui.Panel({
    style: {margin: '6px 0 0 0', shown: false}
  });

  lakeNameInput = ui.Textbox({placeholder: 'Nume lac', style: {stretch: 'horizontal'}});
  box.add(lakeNameInput);

  pickPointButton = ui.Button({
    label: LABEL_ALEGE_PUNCT,
    style: STIL_BUTON_MIC,
    onClick: function() {
      var name = lakeNameInput ? (lakeNameInput.getValue() || '').trim() : '';
      if (!name) {
        if (addLakeStatusLabel) addLakeStatusLabel.setValue('Completează numele lacului înainte de a alege punctul.');
        return;
      }
      isPickingLakePoint = true;
      pickPointButton.setLabel(LABEL_ALEGERE_ARMATA);
      if (addLakeStatusLabel) addLakeStatusLabel.setValue('');
    }
  });
  box.add(pickPointButton);

  addLakeStatusLabel = ui.Label('', {fontSize: '10px', color: '888888', margin: '4px 0'});
  box.add(addLakeStatusLabel);


  var randConfirmareWrapper = ui.Panel({style: {stretch: 'horizontal', textAlign: 'center', margin: '6px 0 0 0'}});
  var randConfirmare = ui.Panel({layout: ui.Panel.Layout.flow('horizontal')});
  okAddLakeButton = ui.Button({label: 'OK', style: STIL_BUTON_OK_DEZACTIVAT, disabled: true, onClick: confirmaAdaugareLac});
  var renuntaButton = ui.Button({label: 'Renunță', style: STIL_BUTON_SECUNDAR, onClick: inchideCasetaAdaugareLac});
  randConfirmare.add(okAddLakeButton);
  randConfirmare.add(renuntaButton);
  randConfirmareWrapper.add(randConfirmare);
  box.add(randConfirmareWrapper);

  return box;
}

//UNDO
//sterge mereu rezultatele unei analize anterioare 
//odata ce se schimba selectia de puncte, acea analiza nu mai corespunde zonei noi
//scoate un singur punct LIFO corespunzator ultimului click

function UNDOButton(){

  var undoButton=ui.Button({label:'UNDO',style: STIL_BUTON_SECUNDAR,onClick :function(){
    if (lakeLayer.length > 0) {
        lakeLayer.forEach(function(layer) { Map.layers().remove(layer); });
        lakeLayer = [];
      }
    if (currentLegendPanel) { Map.remove(currentLegendPanel); currentLegendPanel = null; }
    clearTimelapse();
    clearChartPanel();
  
    if(clickedPoints.length>0){
      clickedPoints.pop();
      invalideazaConturLac();
      var lastLayer=layerPoints.pop();
      if(lastLayer)
        Map.layers().remove(lastLayer);
    }
  }});
  return undoButton;
}

//RESET. sterge toate cele 4 puncte si orice analiza/legenda/grafic facute pentru ele.
function RESETButton(){
var resetButton=ui.Button({label:'RESET',style: STIL_BUTON_PERICOL,onClick: function(){
    clearAnalysisState();
}});

  return resetButton;
}


//deseneaza automat conturul lacului de indata ce exista 4 puncte, INAINTE de a rula orice analiza
//contur de previzualizare  inainte de analiza

function afiseazaConturAutomat() {
  if (clickedPoints.length !== 4) return;

  var zona = ee.Geometry.Polygon(clickedPoints);
  var conturInfo = obtineConturLac(zona);
  var conturFeature = conturInfo.conturFeature;

  conturFeature.geometry().coordinates().evaluate(function(coordsRezultat, eroareGeom) {
    if (eroareGeom || !coordsRezultat || coordsRezultat.length === 0) {
      setStatus(statusLabelAnaliza, 'Nu s-a găsit niciun lac valid în zona selectată. Încearcă alte 4 puncte sau altă zi.', statusSpinnerAnaliza);
      return;
    }
    if (lakeLayer.length > 0) { lakeLayer.forEach(function(l){ Map.layers().remove(l); }); lakeLayer = []; }
    var l1 = ui.Map.Layer(conturFeature, {color: 'red'}, 'Lake outline');
    lakeLayer.push(l1);
    Map.layers().add(l1);
    setStatus(statusLabelAnaliza, 'Zona lacului e definită. Poți selecta un tip de analiză.', statusSpinnerAnaliza);
  });
}

//plaseaza un punct nou pentru a delimita un lac
//cele 4 puncte doar definesc poligonul
//nimic nu ruleaza automat la al 4-lea punct in sensul unei ANALIZE
//userul alege explicit una din cele 3 analize
//click-urile peste 4 sunt ignorate fara mesaj de eroare
function setPoint(coords)
{
  if(clickedPoints.length<4){
  var point=ee.Geometry.Point([coords.lon,coords.lat]);
  clickedPoints.push(point);
  invalideazaConturLac();
  var pointLayer=ui.Map.Layer(point,{color: 'red'},'Point'+ clickedPoints.length);
  layerPoints.push(pointLayer);
  Map.layers().add(pointLayer);
  }
  if(clickedPoints.length===4){
    setStatusLoading(statusLabelAnaliza, 'Se detectează conturul lacului...', statusSpinnerAnaliza);
    afiseazaConturAutomat();
  }
}

//ziua pe baza careia se pot rula cele 3 analize (zi/luna/an).

function DataLacAleasaPanel()
{
  var selector = creeazaRandData(defaultEndDate, function(nouaData){
    dataLacAleasa = nouaData;
    invalideazaConturLac(); // fereastra de detectie a conturului depinde de dataLacAleasa
    // rezultatele vechi (grafice, banda de valori, timelapse) nu mai corespund noii zile,
    // deci readucem tutorialul in panoul din dreapta (la fel ca la RESET)
    arataTutorial = true;
    clearChartPanel();
    if (currentLegendPanel) { Map.remove(currentLegendPanel); currentLegendPanel = null; }
    clearTimelapse();
    ultimaAnalizaZi = null; // butoanele nu mai au ce redesena pana la o noua analiza pe zi
    afiseazaConturAutomat(); // conturul de previzualizare trebuie recalculat daca ziua se schimba
  });
  dataLacAleasa = selector.getValue();
  return selector.panel;
}

// date-picker separat pentru evaluarea la nivel de judet (romburile)
function ReferenceDatePanel() {
  var selector = creeazaRandData(defaultEndDate, function(nouaData){
    selectedDate = nouaData;
    setStatus(statusLabelJudet, 'Dată de referință: ' + selectedDate, statusSpinnerJudet);
  });
  selectedDate = selector.getValue();
  return selector.panel;
}

var ultimaAnalizaZi = null; 

//cele 3 butoane care controleaza ce indici apar pe harta la analiza pe ziua aleasa
//inlocuiesc alegerea layerelor din layers gee
//un buton activ se vede prin text bold + culoare albastra (STIL_BUTON_INDICE_ACTIV)
//inactiv, text normal gri (STIL_BUTON_INDICE_INACTIV)

function toggleIndice(cheie, buton) {
  indiciCheckboxState[cheie] = !indiciCheckboxState[cheie];
  buton.style().set(indiciCheckboxState[cheie] ? STIL_BUTON_INDICE_ACTIV : STIL_BUTON_INDICE_INACTIV);
  redeseneazaIndiciPeHarta();
}

//panou butoane indici
function IndiciCheckboxPanel() {
  var panou = ui.Panel({style: {margin: '0 0 8px 0', padding: '10px'}});
  panou.add(ui.Label('Indici afișați', {fontWeight: 'bold', fontSize: '14px', color: 'black'}));

  var randButoaneIndici = ui.Panel({layout: ui.Panel.Layout.flow('horizontal'), style: {stretch: 'horizontal'}});

  ndtiToggleButton = ui.Button({
    label: 'NDTI',
    style: indiciCheckboxState.ndti ? STIL_BUTON_INDICE_ACTIV : STIL_BUTON_INDICE_INACTIV,
    onClick: function(){ toggleIndice('ndti', ndtiToggleButton); }
  });
  ndciToggleButton = ui.Button({
    label: 'NDCI',
    style: indiciCheckboxState.ndci ? STIL_BUTON_INDICE_ACTIV : STIL_BUTON_INDICE_INACTIV,
    onClick: function(){ toggleIndice('ndci', ndciToggleButton); }
  });
  cdomToggleButton = ui.Button({
    label: 'CDOM',
    style: indiciCheckboxState.cdom ? STIL_BUTON_INDICE_ACTIV : STIL_BUTON_INDICE_INACTIV,
    onClick: function(){ toggleIndice('cdom', cdomToggleButton); }
  });

  randButoaneIndici.add(ndtiToggleButton);
  randButoaneIndici.add(ndciToggleButton);
  randButoaneIndici.add(cdomToggleButton);
  panou.add(randButoaneIndici);

  panou.add(ui.Label('Dacă niciun indice nu e activat, rămâne vizibil doar conturul lacului.',
    {fontSize: '10px', color: '888888', margin: '4px 0 0 0'}));

  return panou;
}

//dacă niciun checkbox nu e activ, se arată doar conturul roșu
//recalculeaza indicii
function redeseneazaIndiciPeHarta() {
  if (!ultimaAnalizaZi) return; // n-are ce redesena, nu s-a rulat inca analiza pe zi

  var contur = ultimaAnalizaZi.contur;
  var conturFeature = ultimaAnalizaZi.conturFeature;
  var imagineSatelit = ultimaAnalizaZi.imagineSatelit;

  if (lakeLayer.length > 0) { lakeLayer.forEach(function(l){ Map.layers().remove(l); }); lakeLayer = []; }

  var indiciBifati = [];
  if (indiciCheckboxState.ndti) indiciBifati.push('NDTI');
  if (indiciCheckboxState.ndci) indiciBifati.push('NDCI');
  if (indiciCheckboxState.cdom) indiciBifati.push('CDOM');

  if (indiciBifati.length === 0) {
    var lOutline = ui.Map.Layer(conturFeature, {color: 'red'}, 'Lake outline');
    lakeLayer.push(lOutline);
    Map.layers().add(lOutline);
    if (currentLegendPanel) { Map.remove(currentLegendPanel); currentLegendPanel = null; }
    return;
  }

  indiciBifati.forEach(function(cheie) {
    var info = INDICI_INFO[cheie];
    var imagineIndice = info.compute(imagineSatelit, contur);
    var layer = ui.Map.Layer(imagineIndice, info.vis(), info.label);
    lakeLayer.push(layer);
    Map.layers().add(layer);
  });

  // legenda: recalculata doar pentru indicii nou bifati
  var ndti = service.NDTI(imagineSatelit, contur);
  var ndci = service.NDCI(imagineSatelit, contur);
  var cdom = service.CDOM(imagineSatelit, contur);
  var ndtiVis = service.NDTIvis();
  var ndciVis = service.NDCIvis();
  var cdomVis = service.CDOMvis();

  ndci.addBands(ndti).addBands(cdom).reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: ultimaAnalizaZi.zona,
    scale: 10,
    maxPixels: 1e9,
    bestEffort: true,
    tileScale: 4
  }).evaluate(function(statistici) {
    if (!statistici || statistici.NDCI_min === undefined || statistici.NDCI_min === null) return;

    if (currentLegendPanel) { Map.remove(currentLegendPanel); currentLegendPanel = null; }
    var legendContainer = ui.Panel({style: {position: 'bottom-left', padding: '10px', backgroundColor: 'rgba(255,255,255,0.9)'}});
    if (indiciCheckboxState.ndci) legendContainer.add(construiestePanouLegenda('NDCI (clorofilă)', statistici.NDCI_min, statistici.NDCI_max, ndciVis.palette));
    if (indiciCheckboxState.ndti) legendContainer.add(construiestePanouLegenda('NDTI (turbiditate)', statistici.NDTI_min, statistici.NDTI_max, ndtiVis.palette));
    if (indiciCheckboxState.cdom) legendContainer.add(construiestePanouLegenda('CDOM (materie organică dizolvată)', statistici.CDOM_min, statistici.CDOM_max, cdomVis.palette));
    Map.add(legendContainer);
    currentLegendPanel = legendContainer;
  });
}

// legenda + grafice de evolutie

function construiestePanouLegenda(titlu, minVal, maxVal, paleta) {
  var panouLegenda = ui.Panel({style: {margin: '0 0 8px 0'}});
  panouLegenda.add(ui.Label(titlu, {fontWeight: 'bold', margin: '2px 0'}));

  // schema de la indieni: valoarea pixelului = longitudinea lui
  // creeaza o rampa liniara 0->100 si aplicand paleta peste ea obtii vizual o bara de gradient a legendei
  var imagineGradient = ee.Image.pixelLonLat().select('longitude');
  var paramThumb = {bbox: [0, 0, 100, 10], dimensions: '200x12', format: 'png', min: 0, max: 100, palette: paleta};
  panouLegenda.add(ui.Thumbnail({image: imagineGradient, params: paramThumb,
    style: {stretch: 'horizontal', margin: '0 0 4px 0', maxHeight: '12px'}}));

  var panouValori = ui.Panel({layout: ui.Panel.Layout.flow('horizontal'), style: {stretch: 'horizontal', width: '200px'}});
  var mijloc = (minVal + maxVal) / 2;
  panouValori.add(ui.Label(minVal.toFixed(3), {margin: '0px', fontSize: '11px', textAlign: 'left', stretch: 'horizontal'}));
  panouValori.add(ui.Label(mijloc.toFixed(3), {margin: '0px', fontSize: '11px', textAlign: 'center', stretch: 'horizontal'}));
  panouValori.add(ui.Label(maxVal.toFixed(3), {margin: '0px', fontSize: '11px', textAlign: 'right', stretch: 'horizontal'}));
  panouLegenda.add(panouValori);

  return panouLegenda;
}

// grafic cu linii cu evolutia NDCI/NDTI/CDOM in timp, pe intervalul startDate, endDate
function construiesteGraficEvolutie(serieIndici, zona, startDate, endDate, titluBaza) {
  var grafic = ui.Chart.image.series(serieIndici, zona, ee.Reducer.mean(), 20, 'system:time_start');
  grafic = grafic.setChartType('LineChart').setOptions({
    title: titluBaza, titleTextStyle: {fontSize: 12},
    hAxis: {title: 'Data', format: 'dd MMM'}, vAxis: {title: 'Valoare'},
    lineWidth: 2, curveType: 'function', legend: {position: 'top'},
    chartArea: {width: '82%', height: '68%'}, pointSize: 4,
    series: {
      0: {color: '2171b5', labelInLegend: 'NDCI'},
      1: {color: 'e31a1c', labelInLegend: 'NDTI'},
      2: {color: '41ab5d', labelInLegend: 'CDOM'}
    }
  });
  return grafic;
}


// grafic de linie care compara un singur indice intre 2 ani (anCurent vs anAnterior), aliniat calendaristic
function construiesteGraficAnAnAnterior(serie, zona, cheieIndice, titluIndice, anCurent, anAnterior) {
  var culori = service.CULORI_INDICI[cheieIndice];
  var titlu = titluIndice + ' - ' + anCurent + ' vs ' + anAnterior;

  var grafic = ui.Chart.image.series(serie, zona, ee.Reducer.mean(), 20, 'system:time_start');
  grafic = grafic.setChartType('LineChart').setOptions({
    title: titlu, titleTextStyle: {fontSize: 12},
    hAxis: {title: 'Data', format: 'dd MMM'}, vAxis: {title: 'Valoare'},
    lineWidth: 2, curveType: 'function', legend: {position: 'top'},
    chartArea: {width: '82%', height: '68%'}, pointSize: 3,
    series: {
      0: {color: culori.viu, labelInLegend: String(anCurent)},
      1: {color: culori.pal, labelInLegend: String(anAnterior)}
    }
  });
  return grafic;
}

// timelapse pentru 30 zile / sezonier

var INDICI_INFO = {
  NDTI: {compute: service.NDTI, vis: service.NDTIvis, label: 'NDTI'},
  NDCI: {compute: service.NDCI, vis: service.NDCIvis, label: 'NDCI'},
  CDOM: {compute: service.CDOM, vis: service.CDOMvis, label: 'CDOM'}
};

// prag minim de acoperire a conturului lacului pentru ca o scena sa intre in timelapse
// sub acest prag, scena e taiata de nori/umbra si strica vizual animatia
//am pus de la mine valoarea de 60% minim
var PRAG_ACOPERIRE_TIMELAPSE = 0.6;

//adauga fiecarei imagini din colectie o proprietate de acoperire 
//e procentul de pixeli valizi din interiorul conturului lacului/totalul pixelilor pe care ii ocupa conturul
//totalPixeliContur se calculeaza o singura data (nu per scena) si se transmite ca valoare

function adaugaAcoperireContur(colectie, zona, totalPixeliContur) {
  return colectie.map(function(img) {
    var pixeliValizi = ee.Number(
      img.select(0).reduceRegion({
        reducer: ee.Reducer.count(),
        geometry: zona,
        scale: 10,
        maxPixels: 1e9,
        bestEffort: true,
        tileScale: 4
      }).values().get(0)
    );
    var acoperire = ee.Number(pixeliValizi).divide(totalPixeliContur);
    return img.set('acoperire', acoperire);
  });
}

//
// genereaza si adauga pe harta un gif animat de tip ui.Thumbnail cu evolutia unui singur indice
// 1 scena satelit = un cadru
// pastreaza DOAR scenele in care cel putin PRAG_ACOPERIRE_TIMELAPSE (60%) 

function genereazaTimelapse(cheieIndice, zona, contur, startDate, endDate) {
  clearTimelapse(); // un singur timelapse afisat o data
  //unul nou il inlocuieste pe cel vechi
  timelapseRequestId += 1;
  var cerereCurenta = timelapseRequestId; // daca vine un raspuns intarziat de la o cerere veche, e ignorat
  setStatusLoading(statusLabelAnaliza, 'Se generează timelapse ' + cheieIndice + '...', statusSpinnerAnaliza);

  var info = INDICI_INFO[cheieIndice];
  var vis = info.vis();

  var serieBruta = service.indiciiPeInterval(zona, contur, startDate, endDate).select(cheieIndice);

  // numarul total de pixeli ai conturului e referinta pt procentul de acoperire
  var totalPixeliContur = ee.Number(
    contur.reduceRegion({
      reducer: ee.Reducer.count(),
      geometry: zona,
      scale: 10,
      maxPixels: 1e9,
      bestEffort: true,
      tileScale: 4
    }).values().get(0)
  );

  var serieCuAcoperire = adaugaAcoperireContur(serieBruta, zona, totalPixeliContur);
  var serieFiltrata = serieCuAcoperire.filter(ee.Filter.gte('acoperire', PRAG_ACOPERIRE_TIMELAPSE));

  ee.Dictionary({total: serieBruta.size(), buneAcoperire: serieFiltrata.size()}).evaluate(function(numere, err) {
    if (cerereCurenta !== timelapseRequestId) return; // a venit intre timp o cerere mai noua, ignoram raspunsul asta

    if (err) {
      print('Eroare la verificarea acoperirii scenelor pentru timelapse ' + cheieIndice + ':', err);
      setStatus(statusLabelAnaliza, 'Eroare la generarea timelapse ' + cheieIndice + '. Vezi consola.', statusSpinnerAnaliza);
      return;
    }

    if (!numere.buneAcoperire || numere.buneAcoperire < 2) {
      print('Nu există acoperire bună (peste ' + (PRAG_ACOPERIRE_TIMELAPSE * 100) + '%) pentru perioada asta (' +
        numere.buneAcoperire + ' din ' + numere.total + ' scene disponibile).');
      setStatus(statusLabelAnaliza, 'Nu există acoperire bună pentru perioada aleasă (indice ' + cheieIndice + ').', statusSpinnerAnaliza);
      return;
    }

    var regiune = zona.bounds();
    var videoParams = {
      dimensions: 360,
      region: regiune,
      framesPerSecond: 2,
      min: vis.min,
      max: vis.max,
      palette: vis.palette,
      crs: 'EPSG:3857'
    };

    var thumb = ui.Thumbnail({
      image: serieFiltrata.select(cheieIndice),
      params: videoParams,
      style: {position: 'bottom-right', margin: '4px'},
      onClick: null
    });

    var container = ui.Panel({
      widgets: [
        ui.Label('Timelapse pentru ' + info.label, {
          fontSize: '13px', fontWeight: 'bold', color: '#222222',
          margin: '2px 4px 4px 4px'
        }),
        thumb
      ],
      style: {
        position: 'bottom-right', padding: '6px',
        backgroundColor: 'rgba(255,255,255,0.95)'
      }
    });

    if (cerereCurenta !== timelapseRequestId) return; // verificat din nou dupa constructia thumbnail-ului, inainte sa il afisam

    Map.add(container);
    timelapseThumbnails.push(container);
    setStatus(statusLabelAnaliza, 'Timelapse ' + cheieIndice + ' generat.', statusSpinnerAnaliza);
  });
}


// construieste panoul cu cele 3 butoane de timelapse + butonul de stergere,
// apelata de ruleazaUltimele30Zile si ruleazaAnalizaSezoniera dupa ce conturul a fost deja confirmat ca valid
function construiestePanouTimelapse(zona, contur, startDate, endDate) {
  var panou = ui.Panel({style: {margin: '8px 0', padding: '10px'}});
  panou.add(ui.Label('Timelapse pe hartă', {fontWeight: 'bold', fontSize: '12px', color: '#222222'}));

  var randButoane = ui.Panel({layout: ui.Panel.Layout.flow('horizontal'), style: {stretch: 'horizontal'}});
  ['NDTI', 'NDCI', 'CDOM'].forEach(function(cheie) {
    randButoane.add(ui.Button({
      label: cheie,
      style: STIL_BUTON_MIC,
      onClick: function() { genereazaTimelapse(cheie, zona, contur, startDate, endDate); }
    }));
  });
  panou.add(randButoane);

  panou.add(ui.Button({
    label: 'Șterge timelapse',
    style: STIL_BUTON_STERGE,
    onClick: clearTimelapse
  }));

  return panou;
}

//afiseaza indicii pe harta + legenda + grafic
//comuna celor 3 butoane de analiza
//startDate/endDate se folosesc pentru scenele din care se calculeaza indicii

function ruleazaAnalizaLac(zona, startDate, endDate, titluGrafic)
{
     setStatusLoading(statusLabelAnaliza, 'Se rulează analiza...', statusSpinnerAnaliza);
     Map.centerObject(zona);

     var conturInfo = obtineConturLac(zona);
     var contur = conturInfo.contur;
     var conturFeature = conturInfo.conturFeature;

     // verifica daca lacul a fost gasit in zona, altfel conturFeature n-are geometrie 
     //desenarea doar nu are loc si pare ca programul nu raspunde of
     conturFeature.geometry().coordinates().evaluate(function(coordsRezultat, eroareGeom) {
       if (eroareGeom || !coordsRezultat || coordsRezultat.length === 0) {
         conturLacCache = null; // permite reincercarea (ex cu alte puncte)
         print('Nu s-a găsit niciun corp de apă valid în zona selectată (fereastra din jurul zilei alese). Încearcă alte 4 puncte sau altă zi.');
         setStatus(statusLabelAnaliza, 'Nu s-a găsit niciun lac valid în zona selectată.', statusSpinnerAnaliza);
         return;
       }

       print('Suprafață lac (m2):', conturFeature.geometry().area(1));

       var imagineSatelit = service.imagineSatelit(zona, startDate, endDate);

       ultimaAnalizaZi = {
         zona: zona,
         contur: contur,
         conturFeature: conturFeature,
         imagineSatelit: imagineSatelit
       };

       redeseneazaIndiciPeHarta();

       if (chartPanel) {
         clearChartPanel();
         if (indiciCheckboxPanel) chartPanel.add(indiciCheckboxPanel); // doar aici - analiza pe ziua aleasa
         var serieIndici = service.indiciiPeInterval(zona, contur, startDate, endDate);
         chartPanel.add(construiesteGraficEvolutie(serieIndici, zona, startDate, endDate, titluGrafic));
       }
       setStatus(statusLabelAnaliza, 'Analiză completă.', statusSpinnerAnaliza);
     });
}

// verifica daca cele 4 puncte au fost plasate inainte de a rula orice analiza pe lacul definit de ele.
//returneaza true daca sunt 4 puncte, altfel afiseaza un mesaj si returneaza false

function verificaZonaLacului() {
  if (clickedPoints.length !== 4) {
    print('Selectează întâi 4 puncte pe hartă pentru a defini zona lacului.');
    setStatus(statusLabelAnaliza, 'Selectează 4 puncte pe hartă înainte de a rula o analiză.', statusSpinnerAnaliza);
    return false;
  }
  if (lakeLayer.length > 0) { lakeLayer.forEach(function(l){ Map.layers().remove(l); }); lakeLayer = []; }
  clearTimelapse();
  return true;
}

// o singura zi exacta are foarte des zero treceri satelitare asa ca se arata in schimb evolutia din saptamana dinaintea ei (inclusiv ziua aleasa)
// afecteaza doar datele folosite pentru indici
// conturul lacului ramane independent
var ZILE_SAPTAMANA_DINAINTE = 7;


function ruleazaAnalizaZiAleasa() {
  if (!verificaZonaLacului()) return;

  arataTutorial = false; // ascunde tot tutorialul imediat, nu doar cand vin rezultatele
  clearChartPanel();
  if (currentLegendPanel) { Map.remove(currentLegendPanel); currentLegendPanel = null; }

  var zona = ee.Geometry.Polygon(clickedPoints);
  var ziAleasa = ee.Date(dataLacAleasa);
  var startDate = ziAleasa.advance(-ZILE_SAPTAMANA_DINAINTE, 'day').format('YYYY-MM-dd').getInfo();
  var endDate = ziAleasa.advance(1, 'day').format('YYYY-MM-dd').getInfo();

  ruleazaAnalizaLac(zona, startDate, endDate, 'Tendința indicilor în săptămâna precedentă ');
}

function ruleazaUltimele30Zile() {
  if (!verificaZonaLacului()) return;

  arataTutorial = false; // ascunde tot tutorialul imediat, nu doar cand vin rezultatele
  clearChartPanel();
  if (currentLegendPanel) { Map.remove(currentLegendPanel); currentLegendPanel = null; } // banda de valori de la analiza pe zi nu ramane peste alt tip de analiza

  setStatusLoading(statusLabelAnaliza, 'Se rulează analiza pe ultimele 30 zile...', statusSpinnerAnaliza);

  var zona = ee.Geometry.Polygon(clickedPoints);
  var ziAleasa = ee.Date(dataLacAleasa);
  var endDate = ziAleasa.advance(1, 'day').format('YYYY-MM-dd').getInfo();
  var startDate = ziAleasa.advance(-30, 'day').format('YYYY-MM-dd').getInfo();

  Map.centerObject(zona);
  var conturInfo = obtineConturLac(zona);
  var contur = conturInfo.contur;
  var conturFeature = conturInfo.conturFeature;

  conturFeature.geometry().coordinates().evaluate(function(coordsRezultat, eroareGeom) {
    if (eroareGeom || !coordsRezultat || coordsRezultat.length === 0) {
      conturLacCache = null;
      print('Nu s-a găsit niciun corp de apă valid în zona selectată (fereastra din jurul zilei alese). Încearcă alte 4 puncte sau altă zi.');
      setStatus(statusLabelAnaliza, 'Nu s-a găsit niciun lac valid în zona selectată.', statusSpinnerAnaliza);
      return;
    }

    print('Suprafață lac (m2):', conturFeature.geometry().area(1));

    var lOutline = ui.Map.Layer(conturFeature, {color: 'red'}, 'Lake outline');
    lakeLayer.push(lOutline);
    Map.layers().add(lOutline);

    if (chartPanel) {
      clearChartPanel();
      var serieIndici = service.indiciiPeInterval(zona, contur, startDate, endDate);
      var titluGrafic = 'Evoluția indicilor în ultimele 30 zile';
      chartPanel.add(construiesteGraficEvolutie(serieIndici, zona, startDate, endDate, titluGrafic));
      chartPanel.add(construiestePanouTimelapse(zona, contur, startDate, endDate));
    }
    setStatus(statusLabelAnaliza, 'Analiză completă.', statusSpinnerAnaliza);
  });
}

function ruleazaAnalizaSezoniera() {
  if (!verificaZonaLacului()) return;

  arataTutorial = false; // ascunde tot tutorialul imediat, nu doar cand vin rezultatele
  clearChartPanel();

  setStatusLoading(statusLabelAnaliza, 'Se rulează analiza sezonieră...', statusSpinnerAnaliza);

  var zona = ee.Geometry.Polygon(clickedPoints);
  var infoSezon = determinaSezonSiAn(dataLacAleasa);
  var cheieSezon = infoSezon.cheieSezon;
  var anSezon = infoSezon.an;

  var intervalCurent = service.getIntervalSezon(cheieSezon, anSezon);
  var intervalAnterior = service.getIntervalSezon(cheieSezon, anSezon - 1);
  var etichetaSezon = service.SEZOANE[cheieSezon].label;

  Map.centerObject(zona);
  if (currentLegendPanel) { Map.remove(currentLegendPanel); currentLegendPanel = null; }
  clearChartPanel();

  var conturInfo = obtineConturLac(zona);
  var contur = conturInfo.contur;
  var conturFeature = conturInfo.conturFeature;

  // conturul e detectat o singura data (independent de sezon) si reutilizat pentru ambele sezoane de mai jos.
  conturFeature.geometry().coordinates().evaluate(function(coordsRezultat, eroareGeom) {
    if (eroareGeom || !coordsRezultat || coordsRezultat.length === 0) {
      conturLacCache = null; // permite reincercarea
      print('Nu s-a găsit niciun corp de apă valid în zona selectată (fereastra din jurul zilei alese).');
      setStatus(statusLabelAnaliza, 'Nu s-a găsit niciun lac valid în zona selectată.', statusSpinnerAnaliza);
      if (chartPanel) {
        chartPanel.add(ui.Label(
          'Nu s-a găsit niciun lac valid în zona selectată (posibil nori/gheață pe fereastra din jurul zilei alese, sau punctele nu acoperă un lac).',
          {fontSize: '12px', color: 'cc0000', margin: '8px'}
        ));
      }
      return;
    }

    print('Suprafață lac (m2):', conturFeature.geometry().area(1));

    var l1 = ui.Map.Layer(conturFeature, {color: 'red'}, 'Lake outline');
    lakeLayer.push(l1);
    Map.layers().add(l1);

    var scorCurent = service.scorSezon(zona, contur, intervalCurent.start, intervalCurent.end);
    var scorAnterior = service.scorSezon(zona, contur, intervalAnterior.start, intervalAnterior.end);
    var lipsaDate = scorCurent.lipsaDate.or(scorAnterior.lipsaDate);
    var infoDelta = service.deltaToColor(scorCurent.scor, scorAnterior.scor, lipsaDate);

    // grupate intr-un singur ee.Dictionary pentru un singur .evaluate()
    var rezumat = ee.Dictionary({
      culoare: infoDelta.culoare, lipsaDate: lipsaDate,
      scorCurent: scorCurent.scor, scorAnterior: scorAnterior.scor,
      ndciCurent: scorCurent.ndci, ndtiCurent: scorCurent.ndti, cdomCurent: scorCurent.cdom,
      ndciAnterior: scorAnterior.ndci, ndtiAnterior: scorAnterior.ndti, cdomAnterior: scorAnterior.cdom
    });

    rezumat.evaluate(function(r, eroare) {
      if (eroare) {
        print('Eroare la calculul comparației sezoniere:', eroare);
        setStatus(statusLabelAnaliza, 'Eroare la calculul comparației sezoniere. Vezi consola.', statusSpinnerAnaliza);
        if (chartPanel) chartPanel.add(ui.Label('Eroare la calculul comparației sezoniere. Vezi consola.', {fontSize: '12px', color: 'cc0000', margin: '8px'}));
        return;
      }

      var titluComparatie = etichetaSezon + ' ' + anSezon + ' vs ' + etichetaSezon + ' ' + (anSezon - 1);
      print(titluComparatie + ':', r);
      setStatus(statusLabelAnaliza, 'Analiză sezonieră completă.', statusSpinnerAnaliza);
      if (!chartPanel) return;

      var panouScor = ui.Panel({style: {margin: '0 0 12px 0', padding: '10px'}});
      panouScor.add(ui.Label(titluComparatie, {fontWeight: 'bold', fontSize: '13px'}));

      if (r.lipsaDate) {
        panouScor.add(ui.Label('Fără date valide într-unul din cele două sezoane', {fontSize: '12px', color: '999999'}));
        chartPanel.add(panouScor);
        return;
      }

      var tendinta = r.scorCurent < r.scorAnterior ? 'îmbunătățire' : (r.scorCurent > r.scorAnterior ? 'înrăutățire' : 'neschimbat');
      panouScor.add(ui.Label('Scor probleme: ' + r.scorAnterior + ' -> ' + r.scorCurent + ' (' + tendinta + ')',
        {fontSize: '12px', color: '#' + r.culoare, fontWeight: 'bold'}));
      chartPanel.add(panouScor);

      var serieIndici = service.indiciiPeInterval(zona, contur, intervalCurent.start, intervalCurent.end);
      chartPanel.add(construiesteGraficEvolutie(serieIndici, zona, intervalCurent.start, intervalCurent.end,
        'Evoluția indicilor, ' + etichetaSezon + ' ' + anSezon));

      adaugaGraficCuConcluzie('NDCI', 'NDCI (clorofilă)', r.ndciAnterior, r.ndciCurent, service.NDCI_ALGAE_THRESHOLD);
      adaugaGraficCuConcluzie('NDTI', 'NDTI (turbiditate)', r.ndtiAnterior, r.ndtiCurent, service.NDTI_TURBIDITY_THRESHOLD);
      adaugaGraficCuConcluzie('CDOM', 'CDOM (masă organică dizolvată)', r.cdomAnterior, r.cdomCurent, service.CDOM_HIGH_THRESHOLD);

      chartPanel.add(construiestePanouTimelapse(zona, contur, intervalCurent.start, intervalCurent.end));

      function adaugaGraficCuConcluzie(cheieIndice, titluIndice, valoareAnterioara, valoareCurenta, prag) {
        var serie = service.indiciiAnAnAnterior(zona, contur, intervalCurent, intervalAnterior, cheieIndice);
        chartPanel.add(construiesteGraficAnAnAnterior(serie, zona, cheieIndice, titluIndice, anSezon, anSezon - 1));

        var cuvantTendinta = valoareCurenta > valoareAnterioara ? 'creștere' : (valoareCurenta < valoareAnterioara ? 'scădere' : 'stagnare');
        var notaPrag = valoareCurenta > prag ? ' — peste pragul vizual (' + prag + ')' : '';
        chartPanel.add(ui.Label(
          titluIndice + ': ' + valoareAnterioara.toFixed(3) + ' -> ' + valoareCurenta.toFixed(3) + ' (' + cuvantTendinta + ')' + notaPrag,
          {fontSize: '11px', margin: '0 0 12px 4px'}
        ));
      }
    });
  });
}

//construieste panoul din stanga
// panoul principal e fixat la stanga prin ui.root
//graficul are panel propriu la dreapta, tot prin ui.root, altfel plutesc random peste harta :))
// Map.add(), ca sa nu se suprapuna niciodata cele doua

function setupPanel(){
  var panel = ui.Panel({
    style: {
      width: '340px',
      padding: '10px'
    }
  });

  var STIL_TITLU_SECTIUNE = {fontWeight: 'bold', fontSize: '20px', margin: '4px 0'};

  panel.add(ui.Label('Monitorizează lacuri', STIL_TITLU_SECTIUNE));

  var randJudetLac = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {stretch: 'horizontal', margin: '6px 0 0 0'}
  });

  var countySelect = ui.Select({
    items: [],
    placeholder: 'Se încarcă județele...',
    style: {
      stretch: 'horizontal',
      border: '0',
      margin: '0 6px 0 0',
      height: '28px',
      padding: '0 10px',
      backgroundColor: '#ffffff'
    },
    onChange: function(name){ switchCounty(name); }
  });

  addLakeButton = ui.Button({
    label: 'Adaugă lac',
    style: STIL_BUTON_DEZACTIVAT, // dezactivat pana se alege un judet
    disabled: true,
    onClick: function(){
      addLakeBoxPanel.style().set('shown', true);
    }
  });

  randJudetLac.add(countySelect);
  randJudetLac.add(addLakeButton);
  panel.add(randJudetLac);

  // caseta de adaugare lac (nume + alege punct + OK/Renunta)
  addLakeBoxPanel = AdaugaLacBoxPanel();
  panel.add(addLakeBoxPanel);

  panel.add(ui.Panel({style: {height: '6px'}}));

  // evaluare calitate apa pentru lacurile din judet (romburile)
  panel.add(ui.Label('Evaluare calitate apă pentru lacurile din județ:', {fontWeight: 'bold', fontSize: '13px', margin: '0 0 2px 0'}));
  panel.add(ReferenceDatePanel());
  var evalButton = ui.Button({label: 'Evaluează calitatea apei', style: STIL_BUTON_PRIMAR, onClick: evaluateWaterQualityTrend});
  panel.add(evalButton);

  // status pt. sectiunea de judet
  statusLabelJudet = ui.Label('', {fontSize: '12px', color: '666666', whiteSpace: 'pre-wrap'});
  statusSpinnerJudet = creeazaClepsidra();
  var randTitluStatusJudet = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {margin: '6px 0 0 0'}
  });
  randTitluStatusJudet.add(ui.Label('Status', {fontWeight: 'bold', margin: '0'}));
  randTitluStatusJudet.add(statusSpinnerJudet);
  panel.add(randTitluStatusJudet);
  panel.add(statusLabelJudet);

  // legenda culorilor romburilor (verde/galben/rosu) 

  legendaCalitateApaPanel = LegendaCalitateApaPanel();
  panel.add(legendaCalitateApaPanel);

  panel.add(linieSeparatoare());

  panel.add(ui.Label('Analizează lac', STIL_TITLU_SECTIUNE));

  panel.add(ui.Label('Delimitează lacul cu 4 puncte pe hartă:', {fontWeight: 'bold', fontSize: '13px', margin: '6px 0 2px 0'}));
  panel.add(ui.Label('Punctele definesc doar conturul lacului.', {fontSize: '11px', color: '888888', margin: '0 0 4px 0'}));
  
  var randUndoWrapper = ui.Panel({style: {stretch: 'horizontal', textAlign: 'center', margin: '0 0 6px 0'}});
  var undoButton = UNDOButton();
  randUndoWrapper.add(undoButton);
  panel.add(randUndoWrapper);

  panel.add(ui.Label('Alege o zi pentru analiză:', {fontWeight: 'bold', fontSize: '13px', margin: '0 0 2px 0'}));
  panel.add(DataLacAleasaPanel());

  var runZiButton = ui.Button({label: 'Analiză în jurul zilei alese', style: STIL_BUTON_ANALIZA, onClick: ruleazaAnalizaZiAleasa});
  panel.add(runZiButton);

  var run30Button = ui.Button({label: 'Analiză ultimele 30 zile', style: STIL_BUTON_ANALIZA, onClick: ruleazaUltimele30Zile});
  panel.add(run30Button);

  var runSeasonButton = ui.Button({label: 'Analiză sezonieră', style: STIL_BUTON_ANALIZA, onClick: ruleazaAnalizaSezoniera});
  panel.add(runSeasonButton);
  
  var resetButtonWrapper = ui.Panel({style: {stretch: 'horizontal', textAlign: 'center', margin: '6px 0'}});
  var resetButton = RESETButton();
  resetButtonWrapper.add(resetButton);
  
  panel.add(resetButtonWrapper);
  // status pt. analiza pe lacul definit de cele 4 puncte
  statusLabelAnaliza = ui.Label('', {fontSize: '12px', color: '666666', whiteSpace: 'pre-wrap'});
  statusSpinnerAnaliza = creeazaClepsidra();
  var randTitluStatusAnaliza = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {margin: '6px 0 0 0'}
  });
  randTitluStatusAnaliza.add(ui.Label('Status analiză', {fontWeight: 'bold', margin: '0'}));
  randTitluStatusAnaliza.add(statusSpinnerAnaliza);
  panel.add(randTitluStatusAnaliza);
  panel.add(statusLabelAnaliza);


  ui.root.insert(0, panel);

  // panel lateral cu checkbox-urile de indici + graficele de evolutie
  indiciCheckboxPanel = IndiciCheckboxPanel();

  // tutorial mic pt. sectiunea 1 din stanga ("Monitorizează lacuri" - romburile de calitate a apei)
  chartPlaceholderJudet = textTutorial(
  'SECȚIUNEA 1: Monitorizează lacuri',
  [
    'Alege un județ din listă.',
    '(Opțional) ADAUGĂ LAC ca să adaugi un lac care nu e deja în baza de date',
    'Alege o dată de referință pentru analiza ta.',
    'Apasă EVALUEAZĂ CALITATEA APEI, iar pe hartă apar marcaje colorate lângă fiecare lac din baza de date din județul ales.',
    'Observă legenda pentru a compara evoluția lacului în ultima săptămână.'
  ],
  ['Evaluarea poate dura câteva zeci de secunde. Așteaptă mesajul "Evaluare completă" din STATUS înainte de a apăsa din nou.']
);

chartPlaceholderAnaliza = textTutorial(
  'SECȚIUNEA 2: Analizează lac',
  [
    'Dă click pe hartă în 4 puncte diferite, ca să delimitezi conturul aproximativ al lacului.',
    'Dacă ai greșit un punct, UNDO șterge ultimul punct plasat.',
    'Alege o zi pentru analiză.',
    'Rulează una din cele 3 analize:\n   - ANALIZĂ ÎN JURUL ZILEI ALESE (tendința din săptămâna dinainte)\n   - ANALIZĂ ULTIMELE 30 ZILE (evoluție din ultima lună)\n   - ANALIZĂ SEZONIERĂ (comparație cu același sezon din anul trecut).',
    'Rezultatele grafice pentru NDCI, NDTI și CDOM apar chiar aici, în locul acestui tutorial.',
    'Pentru o analiză nouă, butonul RESET șterge rezultatele curente și conturul de pe hartă.'
  ],
  [
    'E nevoie de exact 4 puncte pentru analiză. Click-urile peste 4 sunt ignorate.',
    'Schimbarea datei de referință duce la pierderea rezultatelor curente.'
  ]
);
  chartPanel = ui.Panel({style: {width: '380px', padding: '8px'}});
  clearChartPanel();
  ui.root.add(chartPanel);

  COUNTIES_FC.aggregate_array('ADM1_NAME').distinct().sort().evaluate(function(names, err) {
    if (err) {
      countySelect.setPlaceholder('Eroare la încărcarea județelor. Vezi consola.');
      print('Eroare la încărcarea listei de județe:', err);
      return;
    }
    countySelect.items().reset(names);
    countySelect.setPlaceholder('Alege județul');
  });

  return panel;
}
//un singur handler de click
//fie plaseaza un lac nou, fie trimite click-ul la selectia pasiva de 4 puncte.

function onMapClick(coords) {
  if (isPickingLakePoint) {
    pendingLakePoint = coords;
    isPickingLakePoint = false;
    //se poate schimba punctul ales pe harta
    if (pickPointButton) pickPointButton.setLabel(LABEL_SCHIMBA_PUNCT);
    if (addLakeStatusLabel) {
      addLakeStatusLabel.setValue('Punct ales: ' + coords.lat.toFixed(5) + ', ' + coords.lon.toFixed(5));
    }
    setStareButonOK(true);

    if (pendingLakePointLayer) { Map.layers().remove(pendingLakePointLayer); pendingLakePointLayer = null; }
    var punctTemp = ee.Geometry.Point([coords.lon, coords.lat]);
    pendingLakePointLayer = ui.Map.Layer(punctTemp, {color: 'green'}, 'Punct lac nou');
    Map.layers().add(pendingLakePointLayer);
    return;
  }
  setPoint(coords);
}

// startt() e împachetat în try/catch, ca orice eroare rămasă pentru gee apps să apară explicit în consolă cu
// print(), în loc să oprească execuția silențios și să lase app blocat
exports.startt = function()
{
  try {
    setupPanel();
    Map.style().set('cursor', 'crosshair');
    Map.setCenter(25, 46, 7); // centru aproximativ pe Romania, ca un judet sa fie vizibil imediat
    Map.onClick(onMapClick);
  } catch (e) {
    print('EROARE la pornirea aplicației:', (e && (e.message || e.toString())) || e);
  }
};