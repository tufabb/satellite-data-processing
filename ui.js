var service = require('users/monicadima241627/satellite:composite');

// selecția de 4 puncte, doar delimitează un poligon, nu declanșează nimic
// analiza rulează separat din butoanele din panel
var clickedPoints = [];
var layerPoints = [];      // layerele punctelor rosii, ca sa poata fi sterse la UNDO
var lakeLayer = [];        // layerele unei analize (satelit + indici + contur), sterse la fiecare rulare noua
var currentLegendPanel = null;

var now = ee.Date(Date.now());
var defaultEndDate = now.format('YYYY-MM-dd').getInfo();

// data pe baza careia ruleaza cele 3 analize (ziua exacta / ultimele 30 zile / sezonul)
var dataLacAleasa = defaultEndDate;

// conturul lacului calculat o singura data per selectie de 4 puncte si
// refolosit de toate cele 3 analize, ca sa nu recalculam de 3 ori acelasi lucru 
var conturLacCache = null;

// judete + HydroLAKES + lacuri adaugate de user

var COUNTIES_FC = ee.FeatureCollection('FAO/GAUL/2015/level1')
  .filter(ee.Filter.eq('ADM0_NAME', 'Romania'));
var countyNames = COUNTIES_FC.aggregate_array('ADM1_NAME').distinct().sort().getInfo();

var HYDROLAKES = ee.FeatureCollection('projects/sat-io/open-datasets/HydroLakes/lake_poly_v10');

var currentCountyGeometry = null;
var userLakes = [];          // {name, lat, lon, radius} doar per sesiune, golit la schimbarea judetului
var lakeList = [];           //lista lacurilor judetului curent, colorata dupa evaluare
var lakePointsFC = null;
var lakePointsLayer = null;  // layerul romburilor judetului
var isAddLakeMode = false;
var addModeButton = null;
var lakeNameInput = null;
var USER_LAKE_RADIUS_M = 100; // raza fixa, nereglabila din UI, pt. lacurile adaugate manual (doar puncte, nu poligoane)
var radiusLacUser = USER_LAKE_RADIUS_M;
var statusLabel = null;

var selectedDate = defaultEndDate; // data de referinta pentru evaluarea la nivel de judet (romburile)

var chartPanel = null;
var chartPlaceholder = null;

// selector de data (zi/luna/an), comun pentru cele 2 widgets din panel

var LUNI = [
  {label:'Ianuarie',number:'01'},{label:'Februarie',number:'02'},{label:'Martie',number:'03'},
  {label:'Aprilie',number:'04'},{label:'Mai',number:'05'},{label:'Iunie',number:'06'},
  {label:'Iulie',number:'07'},{label:'August',number:'08'},{label:'Septembrie',number:'09'},
  {label:'Octombrie',number:'10'},{label:'Noiembrie',number:'11'},{label:'Decembrie',number:'12'}
];
var ETICHETE_LUNI = LUNI.map(function(l){ return l.label; });

function lunaLabelDinNumar(numar) {
  var gasit = LUNI.filter(function(l){ return l.number === numar; })[0];
  return gasit ? gasit.label : 'Ianuarie';
}
function lunaNumarDinLabel(label) {
  var gasit = LUNI.filter(function(l){ return l.label === label; })[0];
  return gasit ? gasit.number : '01';
}

var ANUL_CURENT = new Date().getFullYear();
var ANI_DISPONIBILI = [];
for (var anIt = 2019; anIt <= ANUL_CURENT; anIt++) ANI_DISPONIBILI.push(String(anIt));

var ZILE_DISPONIBILE = [];
for (var ziIt = 1; ziIt <= 31; ziIt++) ZILE_DISPONIBILE.push(ziIt < 10 ? '0' + ziIt : String(ziIt));

//construieste 3 ui.Select (zi/luna/an) legate printr-un closure comun
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

/**
 * decembrie apartine sezonului de iarna al anului URMATOR (dec 2025 = iarna 2026, alaturi de ian-feb 2026)
 * trebuie sa coincida cu conventia din service.getIntervalSezon
 */
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
// calculata local, nu pe server gee ca sa mearga mai repede

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

function buildStyledPointsFC() {
  if (!lakeList || lakeList.length === 0) return null;
  var features = lakeList.map(function(p) {
    return ee.Feature(ee.Geometry.Point([p.lon, p.lat]), {
      style: {color: p.color || '1E90FF', pointShape: 'diamond', pointSize: 8, width: 1}
    });
  });
  return ee.FeatureCollection(features);
}

// lacurile adaugate de user sunt doar puncte (click), fara poligon
// primesc un buffer de raza fixa ca sa existe o arie pe care sa poata face calcule (reduceRegion etc), la fel ca lacurile din HydroLAKES.
function buildUserLakesFC() {
  if (userLakes.length === 0) return null;
  var features = userLakes.map(function(l) {
    var geom = ee.Geometry.Point([l.lon, l.lat]).buffer(l.radius);
    return ee.Feature(geom, {name: l.name, area_m2: geom.area(1), source: 'User added'});
  });
  return ee.FeatureCollection(features);
}

// filtreaza pe dreptunghiul care incadreaza judetului (nu pe conturul exact), altfel pe contur exact merge greu
// poate include lacuri din judete vecine la un judet cu forma neregulata
// findClosest elimina mare parte din greselile rezultate din asta
function buildAllLakePolygons() {
  var bigLakes = HYDROLAKES.filterBounds(currentCountyGeometry.bounds()).map(function(f) {
    return f.set('name', f.get('Lake_name'))
      .set('area_m2', ee.Number(f.get('Lake_area')).multiply(1e6)) // km2 -> m2
      .set('source', 'HydroLAKES');
  });
  var userLakesFC = buildUserLakesFC();
  return userLakesFC ? bigLakes.merge(userLakesFC) : bigLakes;
}

function clearChartPanel() {
  if (!chartPanel) return;
  chartPanel.clear();
  if (chartPlaceholder) chartPanel.add(chartPlaceholder);
}

function invalideazaConturLac() {
  conturLacCache = null;
}

function obtineConturLac(zona) {
  if (!conturLacCache) {
    conturLacCache = service.detecteazaConturLac(zona, dataLacAleasa);
  }
  return conturLacCache;
}

// reseteaza tot ce tine de selectia manuala de 4 puncte
function clearAnalysisState() {
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
  clearChartPanel();
}

// redeseneaza doar romburile judetului
function renderPreview() {
  if (lakePointsLayer) { Map.layers().remove(lakePointsLayer); lakePointsLayer = null; }
  if (lakePointsFC) {
    lakePointsLayer = ui.Map.Layer(lakePointsFC.style({styleProperty: 'style'}), {}, 'Corpuri de apă');
    Map.layers().add(lakePointsLayer);
  }
}

// lista de lacuri a judetului

function reloadLakeList() {
  if (!currentCountyGeometry) return;
  if (statusLabel) statusLabel.setValue('Se încarcă lista de lacuri...');

  var allPolygons = buildAllLakePolygons();

  var points = allPolygons.map(function(f) {
    return ee.Feature(f.geometry().centroid(1), {
      name: f.get('name'), area_m2: f.get('area_m2'), source: f.get('source')
    });
  });

  // .evaluate() = singurul moment in care datele server GEE ajung efectiv
  // pe client, asincron (nu blocheaza UI-ul, spre deosebire de .getInfo()).
  points.evaluate(function(fc, err) {
    if (err) {
      print('Eroare la încărcarea lacurilor:', err);
      if (statusLabel) statusLabel.setValue('Eroare la încărcare. Vezi consola.');
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
    if (statusLabel) statusLabel.setValue('Au fost găsite ' + lakeList.length + ' lacuri.');
    renderPreview();
  });
}

function switchCounty(name) {
  var feature = ee.Feature(COUNTIES_FC.filter(ee.Filter.eq('ADM1_NAME', name)).first());
  currentCountyGeometry = feature.geometry();

  userLakes = []; // lacurile adaugate manual n-au sens transferate la alt judet
  clearAnalysisState();

  Map.centerObject(feature);
  reloadLakeList();
}

/**
 * evalueaza cum s-a schimbat calitatea apei (saptamana ce se termina la
 * selectedDate vs saptamana dinainte) pentru fiecare lac din judet, si
 * recoloreaza romburile: verde = mai bine, galben = la fel, rosu = mai rau.
 *
 * currentCountyGeometry e folosita de service.evalueazaEvolutiaCalitatii
 * DOAR ca filtru de cautare: alege O SINGURA scena Sentinel-2 putin
 * innorata pentru tot judetul (calculata o data, nu per lac), din care
 * fiecare lac isi citeste apoi propriile valori prin reduceRegion
 */
function evaluateWaterQualityTrend() {
  if (!currentCountyGeometry) {
    print('Alege mai întâi un județ.');
    if (statusLabel) statusLabel.setValue('Alege mai întâi un județ.');
    return;
  }
  if (!selectedDate) {
    if (statusLabel) statusLabel.setValue('Alege o dată de referință și încearcă din nou.');
    return;
  }

  if (statusLabel) statusLabel.setValue('Se calculează evoluția calității apei...');

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
      if (statusLabel) statusLabel.setValue('Eroare la evaluare. Vezi consola.');
      return;
    }
    fc.features.forEach(function(feat) {
      var lon = feat.geometry.coordinates[0];
      var lat = feat.geometry.coordinates[1];
      var match = findClosest(lat, lon, lakeList, 200);
      if (match) { match.color = feat.properties.color; match.status = feat.properties.status; }
    });
    lakePointsFC = buildStyledPointsFC();
    if (statusLabel) statusLabel.setValue('Evaluare completă.');
    print('Evaluare evoluție calitate apă completă pentru', lakeList.length, 'corpuri de apă.');
    renderPreview();
  });
}

/**
 * adauga un lac nou la lista userului, la coordonatele date, apoi reincarca totul (HydroLAKES + user)
 * tine doar pt sesiunea curenta, se pierde la refresh
 * foloseste bufferul fix USER_LAKE_RADIUS_M.
 */
function addUserLake(coords) {
  var name = lakeNameInput ? lakeNameInput.getValue() : '';
  if (!name) name = '(lac adăugat de user, nedenumit)';
  userLakes.push({name: name, lat: coords.lat, lon: coords.lon, radius: radiusLacUser});
  if (lakeNameInput) lakeNameInput.setValue('');
  reloadLakeList(); // reincarcare completa
}

/**
 * UNDO. sterge mereu rezultatele unei analize anterioare (odata ce se
 * schimba selectia de puncte, acea analiza nu mai corespunde zonei noi),
 * apoi scoate ultimul punct plasat
 * tip LIFO i guess
 */
function UNDOButton(){

var undoButton=ui.Button({label:'UNDO',style:{width: '100px'},onClick :function(){
  if (lakeLayer.length > 0) {
      lakeLayer.forEach(function(layer) { Map.layers().remove(layer); });
      lakeLayer = [];
    }
  if (currentLegendPanel) { Map.remove(currentLegendPanel); currentLegendPanel = null; }
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
/**
 * RESET. sterge toate cele 4 puncte si orice analiza/legenda/grafic facute pentru ele.
 */
function RESETButton(){
var resetButton=ui.Button({label:'RESET',style:{width:'100px'},onClick: function(){
    clearAnalysisState();
}});

  return resetButton;
}
/**
 * plaseaza un punct nou pentru a delimita un lac. cele 4 puncte doar
 * definesc poligonul
 * nimic nu ruleaza automat la al 4-lea punct, userul alege explicit una din cele 3 analize 
 * click-urile peste 4 sunt ignorate fara mesaj de eroare
 */
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
  if(clickedPoints.length===4 && statusLabel){
    statusLabel.setValue('Zona lacului e definită. Alege mai jos ce analiză vrei să rulezi.');
  }
}

/**
 * ziua pe baza careia se pot rula cele 3 analize (zi/luna/an).
 */
function DataLacAleasaPanel()
{
  var selector = creeazaRandData(defaultEndDate, function(nouaData){
    dataLacAleasa = nouaData;
    invalideazaConturLac(); // fereastra de detectie a conturului depinde de dataLacAleasa
  });
  dataLacAleasa = selector.getValue();
  return selector.panel;
}

// date-picker separat pentru evaluarea la nivel de judet (romburile) 
function ReferenceDatePanel() {
  var selector = creeazaRandData(defaultEndDate, function(nouaData){
    selectedDate = nouaData;
    if (statusLabel) statusLabel.setValue('Dată de referință: ' + selectedDate);
  });
  selectedDate = selector.getValue();
  return selector.panel;
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

function construiesteGraficEvolutie(serieIndici, zona, startDate, endDate, titluBaza) {
  var interval = ee.List([ee.Date(startDate).format('YYYY-MM-dd'), ee.Date(endDate).advance(-1, 'day').format('YYYY-MM-dd')]).getInfo();
  var titlu = titluBaza + ' (' + interval[0] + ' -> ' + interval[1] + ')';

  var grafic = ui.Chart.image.series(serieIndici, zona, ee.Reducer.mean(), 20, 'system:time_start');
  grafic = grafic.setChartType('LineChart').setOptions({
    title: titlu, titleTextStyle: {fontSize: 12},
    hAxis: {title: 'Data', format: 'dd MMM'}, vAxis: {title: 'Valoare'},
    lineWidth: 2, curveType: 'function', legend: {position: 'top'},
    chartArea: {width: '82%', height: '68%'}, pointSize: 4,
    series: {
      0: {color: '2171b5', labelInLegend: 'NDCI (clorofilă)'},
      1: {color: 'e31a1c', labelInLegend: 'NDTI (turbiditate)'},
      2: {color: '41ab5d', labelInLegend: 'CDOM'}
    }
  });
  return grafic;
}


function construiesteGraficAnAnAnterior(serie, zona, cheieIndice, titluIndice, anCurent, anAnterior) {
  var culori = service.CULORI_INDICI[cheieIndice];
  var titlu = titluIndice + ' - ' + anCurent + ' vs ' + anAnterior;

  var grafic = ui.Chart.image.series(serie, zona, ee.Reducer.mean(), 20, 'system:time_start');
  grafic = grafic.setChartType('LineChart').setOptions({
    title: titlu, titleTextStyle: {fontSize: 12},
    hAxis: {title: 'Data (aliniat calendaristic)', format: 'dd MMM'}, vAxis: {title: 'Valoare'},
    lineWidth: 2, curveType: 'function', legend: {position: 'top'},
    chartArea: {width: '82%', height: '68%'}, pointSize: 3,
    series: {
      0: {color: culori.viu, labelInLegend: String(anCurent)},
      1: {color: culori.pal, labelInLegend: String(anAnterior) + ' (anul trecut)'}
    }
  });
  return grafic;
}

/**
 * afiseaza indicii pe harta + legenda + grafic
 * comuna celor 3 butoane de analiza
 * startDate/endDate se folosesc DOAR pentru compozitia satelitara din care se calculeaza indicii
 * conturul lacului vine din obtineConturLac 
 */
function ruleazaAnalizaLac(zona, startDate, endDate, titluGrafic)
{
     Map.centerObject(zona);

     var conturInfo = obtineConturLac(zona);
     var contur = conturInfo.contur;
     var conturFeature = conturInfo.conturFeature;

     // verifica daca lacul a fost gasit in zona, altfel conturFeature n-are geometrie desenarea doar nu are loc 
     //si pare ca programul nu raspunde
     conturFeature.geometry().coordinates().evaluate(function(coordsRezultat, eroareGeom) {
       if (eroareGeom || !coordsRezultat || coordsRezultat.length === 0) {
         conturLacCache = null; // permite reincercarea (ex cu alte puncte)
         print('Nu s-a găsit niciun corp de apă valid în zona selectată (fereastra din jurul zilei alese). Încearcă alte 4 puncte sau altă zi.');
         if (statusLabel) statusLabel.setValue('Nu s-a găsit niciun lac valid în zona selectată.');
         return;
       }

       print('Suprafață lac (m2):', conturFeature.geometry().area(1));

       var imagineSatelit = service.imagineSatelit(zona,startDate,endDate);
       var ndti= service.NDTI(imagineSatelit, contur);
       var ndci= service.NDCI(imagineSatelit, contur);
       var cdom= service.CDOM(imagineSatelit, contur);

       var ndtiVis=service.NDTIvis();
       var ndciVis=service.NDCIvis();
       var cdomVis=service.CDOMvis();

       var l0= ui.Map.Layer(imagineSatelit, {bands:['B4','B3','B2'], min:0, max:3000}, 'Satelit');
       var l2= ui.Map.Layer(ndti,ndtiVis,'Turbidity',false);
       var l3= ui.Map.Layer(ndci,ndciVis,'Chlorophyll',false);
       var l4= ui.Map.Layer(cdom,cdomVis,'CDOM',false);
       var l5= ui.Map.Layer(conturFeature,{color:'red'},'Lake outline');

       lakeLayer.push(l0,l2,l3,l4,l5);

       Map.layers().add(l0);
       Map.layers().add(l2);
       Map.layers().add(l3);
       Map.layers().add(l4);
       Map.layers().add(l5);

       ndci.addBands(ndti).addBands(cdom).reduceRegion({
        reducer: ee.Reducer.minMax(),
        geometry: zona,
        scale: 10,
        maxPixels: 1e9,
        bestEffort: true, // evita eroarea "too many pixels" pe zone mai mari
        tileScale: 4       // mai lent, dar mai robust la memorie
      }).evaluate(function(statistici) {
        if (!statistici || statistici.NDCI_min === undefined || statistici.NDCI_min === null) {
          print('Nu există pixeli valizi peste acest lac în perioada aleasă pentru indici (posibil nori). Încearcă altă zi/interval.');
          return;
        }
        // print('Interval NDCI folosit:', statistici.NDCI_min, ':', statistici.NDCI_max);
        // print('Interval NDTI folosit:', statistici.NDTI_min, ':', statistici.NDTI_max);
        // print('Interval CDOM folosit:', statistici.CDOM_min, ':', statistici.CDOM_max);

        if (currentLegendPanel) { Map.remove(currentLegendPanel); currentLegendPanel = null; }
        var legendContainer = ui.Panel({style: {position: 'bottom-left', padding: '8px', backgroundColor: 'rgba(255,255,255,0.85)'}});
        legendContainer.add(construiestePanouLegenda('NDCI (clorofilă)', statistici.NDCI_min, statistici.NDCI_max, ndciVis.palette));
        legendContainer.add(construiestePanouLegenda('NDTI (turbiditate)', statistici.NDTI_min, statistici.NDTI_max, ndtiVis.palette));
        legendContainer.add(construiestePanouLegenda('CDOM', statistici.CDOM_min, statistici.CDOM_max, cdomVis.palette));
        Map.add(legendContainer);
        currentLegendPanel = legendContainer;
      });

       if (chartPanel) {
         clearChartPanel();
         var serieIndici = service.indiciiPeInterval(zona, contur, startDate, endDate);
         chartPanel.add(construiesteGraficEvolutie(serieIndici, zona, startDate, endDate, titluGrafic));
       }
     });
}

/**
 * verifica ca cele 4 puncte au fost plasate inainte de a rula orice
 * analiza pe lacul definit de ele.
 * returneaza true daca sunt 4 puncte, altfel afiseaza un mesaj si
 * returneaza false.
*/
function verificaZonaLacului() {
  if (clickedPoints.length !== 4) {
    print('Selectează întâi 4 puncte pe hartă pentru a defini zona lacului.');
    if (statusLabel) statusLabel.setValue('Selectează 4 puncte pe hartă înainte de a rula o analiză.');
    return false;
  }
  if (lakeLayer.length > 0) { lakeLayer.forEach(function(l){ Map.layers().remove(l); }); lakeLayer = []; }
  return true;
}

// o singura zi exacta are foarte des ZERO treceri satelitare asa ca se arata in schimb evolutia din
// saptamana dinaintea ei (inclusiv ziua aleasa)
// afecteaza doar datele folosite pentru INDICI - conturul lacului ramane independent
var ZILE_SAPTAMANA_DINAINTE = 7;

/**
 * analiza pentru ziua aleasa (dataLacAleasa)
 * graficul arata tendinta indicilor din saptamana de dinaintea ei.
 */
function ruleazaAnalizaZiAleasa() {
  if (!verificaZonaLacului()) return;

  var zona = ee.Geometry.Polygon(clickedPoints);
  var ziAleasa = ee.Date(dataLacAleasa);
  var startDate = ziAleasa.advance(-ZILE_SAPTAMANA_DINAINTE, 'day').format('YYYY-MM-dd').getInfo();
  var endDate = ziAleasa.advance(1, 'day').format('YYYY-MM-dd').getInfo();

  ruleazaAnalizaLac(zona, startDate, endDate, 'Tendința indicilor, săptămâna dinaintea zilei ' + dataLacAleasa);
}

/**
 * analiza pe ultimele 30 de zile dinaintea zilei alese (inclusiv), pentru indici
 */
function ruleazaUltimele30Zile() {
  if (!verificaZonaLacului()) return;

  var zona = ee.Geometry.Polygon(clickedPoints);
  var ziAleasa = ee.Date(dataLacAleasa);
  var endDate = ziAleasa.advance(1, 'day').format('YYYY-MM-dd').getInfo();
  var startDate = ziAleasa.advance(-30, 'day').format('YYYY-MM-dd').getInfo();

  ruleazaAnalizaLac(zona, startDate, endDate, 'Evoluția indicilor, ultimele 30 zile înainte de ' + dataLacAleasa);
}

/**
 * analiza sezoniera: sezonul din care face parte dataLacAleasa, comparat cu acelasi sezon din anul anterior
 */
function ruleazaAnalizaSezoniera() {
  if (!verificaZonaLacului()) return;

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
      if (statusLabel) statusLabel.setValue('Nu s-a găsit niciun lac valid în zona selectată.');
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
        if (chartPanel) chartPanel.add(ui.Label('Eroare la calculul comparației sezoniere. Vezi consola.', {fontSize: '12px', color: 'cc0000', margin: '8px'}));
        return;
      }

      var titluComparatie = etichetaSezon + ' ' + anSezon + ' vs ' + etichetaSezon + ' ' + (anSezon - 1);
      print(titluComparatie + ':', r);
      if (!chartPanel) return;

      var panouScor = ui.Panel({style: {margin: '0 0 12px 0', padding: '8px', backgroundColor: '#f5f5f5'}});
      panouScor.add(ui.Label(titluComparatie + ' (dedus din data ' + dataLacAleasa + ')', {fontWeight: 'bold', fontSize: '13px'}));

      if (r.lipsaDate) {
        panouScor.add(ui.Label('Fără date valide într-unul din cele două sezoane (posibil nori sau gheață).', {fontSize: '12px', color: '999999'}));
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
      adaugaGraficCuConcluzie('CDOM', 'CDOM', r.cdomAnterior, r.cdomCurent, service.CDOM_HIGH_THRESHOLD);

      // definita local (closure peste zona/contur/intervale/anSezon/chartPanel,
      // toate deja in scope) - ridicarea ei la nivel global ar cere pasarea
      // explicita a tuturor acestor parametri, fara niciun beneficiu real.
      function adaugaGraficCuConcluzie(cheieIndice, titluIndice, valoareAnterioara, valoareCurenta, prag) {
        var serie = service.indiciiAnAnAnterior(zona, contur, intervalCurent, intervalAnterior, cheieIndice);
        chartPanel.add(construiesteGraficAnAnAnterior(serie, zona, cheieIndice, titluIndice, anSezon, anSezon - 1));

        var cuvantTendinta = valoareCurenta > valoareAnterioara ? 'a crescut' : (valoareCurenta < valoareAnterioara ? 'a scăzut' : 'neschimbat');
        var notaPrag = valoareCurenta > prag ? ' — peste pragul vizual (' + prag + ')' : '';
        chartPanel.add(ui.Label(
          titluIndice + ': ' + valoareAnterioara.toFixed(3) + ' -> ' + valoareCurenta.toFixed(3) + ' (' + cuvantTendinta + ')' + notaPrag,
          {fontSize: '11px', margin: '0 0 12px 4px'}
        ));
      }
    });
  });
}

/**
 * construieste panoul din stanga
 * judet - adauga lac - evaluare pe judet - status - cele 4 puncte - ziua aleasa + cele 3 analize pe baza ei.
 *
 * panoul principal e fixat la STANGA prin ui.root, iar graficul are panel
 * propriu la DREAPTA, tot prin ui.root, altfel plutesc random peste harta :))
 * Map.add(), ca sa nu se suprapuna niciodata cele doua
 */
function setupPanel(){
  var panel = ui.Panel({
    style: {
      width: '340px',
      padding: '10px'
    }
  });

   panel.add(ui.Label({
    value:
      'Lake configuration',
    style:
      {
        fontWeight: 'bold',
        fontSize: '20px'
      }
  }));


  statusLabel = ui.Label('', {fontSize: '11px', color: '666666', whiteSpace: 'pre-wrap'});

  // judet
  panel.add(ui.Label('Alege județul:', {margin: '10px 0 2px 0'}));
  var countySelect = ui.Select({
    items: countyNames,
    placeholder: 'Alege județul',
    onChange: function(name){ switchCounty(name); }
  });
  panel.add(countySelect);

  // adauga lac
  panel.add(ui.Label('Adaugă un lac:', {fontWeight: 'bold', margin: '14px 0 2px 0'}));
  lakeNameInput = ui.Textbox({placeholder: 'Nume lac'});
  panel.add(lakeNameInput);
  addModeButton = ui.Button('Adaugă lac', function(){
    isAddLakeMode = true;
    addModeButton.setLabel('Click pe hartă pentru a plasa lacul');
  });
  panel.add(addModeButton);

  // evaluare calitate apa pentru lacurile din judet (romburile)
  panel.add(ui.Label('Evaluare calitate apă pentru lacurile din județ:', {fontWeight: 'bold', margin: '16px 0 2px 0'}));
  panel.add(ui.Label('Dată de referință:', {fontSize: '11px'}));
  panel.add(ReferenceDatePanel());
  var evalButton = ui.Button('Evaluează calitatea apei', evaluateWaterQualityTrend);
  panel.add(evalButton);

  // status, scris explicit
  panel.add(ui.Label('Status:', {fontWeight: 'bold', margin: '10px 0 0 0'}));
  panel.add(statusLabel);

  // cele 4 puncte - doar delimiteaza lacul, nu fac nimic singure
  panel.add(ui.Label('Click pe hartă (4 puncte) pentru a delimita un lac:', {fontWeight: 'bold', margin: '16px 0 2px 0'}));
  panel.add(ui.Label('Punctele doar definesc conturul zonei.Ruleaza analiza separat cu butoanele de mai jos.', {fontSize: '11px', color: '888888'}));
  var undoButton = UNDOButton();
  var resetButton = RESETButton();
  panel.add(undoButton);
  panel.add(resetButton);

  // ziua aleasa + cele 3 analize pe baza ei
  panel.add(ui.Label('Alege o zi pentru analiza acestui lac:', {margin: '12px 0 2px 0', fontSize: '11px'}));
  panel.add(DataLacAleasaPanel());

  var runZiButton = ui.Button({label: 'Analiză în jurul zilei alese', style: {stretch: 'horizontal', margin: '6px 0 0 0'}, onClick: ruleazaAnalizaZiAleasa});
  panel.add(runZiButton);

  var run30Button = ui.Button({label: 'Analiză ultimele 30 zile', style: {stretch: 'horizontal'}, onClick: ruleazaUltimele30Zile});
  panel.add(run30Button);

  var runSeasonButton = ui.Button({label: 'Analiză sezonieră', style: {stretch: 'horizontal'}, onClick: ruleazaAnalizaSezoniera});
  panel.add(runSeasonButton);


  // panel lateral cu graficele de evolutie
  chartPlaceholder = ui.Label(
    'Delimitează un lac cu 4 puncte pe hartă, apoi alege o zi și rulează una din cele 3 analize ' +
    '(ziua aleasă, ultimele 30 zile, sau sezonul) ca să vezi aici evoluția indicilor (NDCI, NDTI, CDOM).',
    {fontSize: '12px', color: '888888', whiteSpace: 'pre-wrap', margin: '8px'}
  );
  chartPanel = ui.Panel({style: {width: '380px', padding: '8px'}});
  clearChartPanel();
  ui.root.add(chartPanel);

  return panel;
}

/**
 * un singur handler de click
 * fie plaseaza un lac nou (add-lake mode), fie trimite click-ul la selectia pasiva de 4 puncte.
 */
function onMapClick(coords) {
  if (isAddLakeMode) {
    addUserLake(coords);
    isAddLakeMode = false;
    if (addModeButton) addModeButton.setLabel('Adaugă lac');
    return;
  }
  setPoint(coords);
}

exports.startt=function()
{

   var mainPanel = setupPanel();
   Map.style().set('cursor','crosshair');
   Map.setCenter(25, 46, 7); // centru aproximativ pe Romania, ca un judet sa fie vizibil imediat
   Map.onClick(onMapClick);
   
   ui.root.insert(0, mainPanel);
 };