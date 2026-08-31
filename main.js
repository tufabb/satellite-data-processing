//todo: make a panel and put the buttons there, make a caseta where you can choose the date, display elsewhere the results/numerotate them
//solve the crashing problems

//--------------UI----------------------------------------------//
var clickedPoints=[];
var layerPoints=[];
var lakeLayer=[];
//UNDO BUTTON
var undoButton=ui.Button({label:'UNDO',style:{width: '100px'},onClick :function(){
  if (lakeLayer.length > 0) {
      lakeLayer.forEach(function(layer) { Map.layers().remove(layer); });
      lakeLayer = [];
    }
  
  if(clickedPoints.length>0){
    clickedPoints.pop();
    var lastLayer=layerPoints.pop();
    if(lastLayer)
      Map.layers().remove(lastLayer);
    
  }
}});
Map.add(undoButton);
//RESET BUTTON
var resetButton=ui.Button({label:'RESET',style:{width:'100px'},onClick: function(){
    while(clickedPoints.length>0){
      clickedPoints.pop();
    var lastLayer=layerPoints.pop();
    if(lastLayer)
      Map.layers().remove(lastLayer);
    }
   if (lakeLayer.length > 0) {
      lakeLayer.forEach(function(layer) { Map.layers().remove(layer); });
      lakeLayer = [];
    }
  
  
}});
Map.add(resetButton);

//---------------CLOUDS MASKING----------------------------------//
var csPlus = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');
function maskFull(image) {
  var scl = image.select('SCL');
  // 3=CLOUD SHADOWS;  8=MEDIUM PROB CLOUDS;  9=HIGH PROB CLOUDS; 10=CIRRUS CLOUDS; 11=ICE/SNOW
  var sclMask = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
  var csMask = image.select('cs_cdf').gte(0.4);
  return image.updateMask(sclMask.and(csMask));
}

//--------------SETUP LAKE----------------------------------------//

Map.style().set('cursor','crosshair');
Map.onClick(function(coords){
  if(clickedPoints.length<4){
  var point=ee.Geometry.Point([coords.lon,coords.lat]);
  clickedPoints.push(point);
  var pointLayer=ui.Map.Layer(point,{color: 'red'},'Point'+ clickedPoints.length);
  layerPoints.push(pointLayer);
  Map.layers().add(pointLayer);}
  if(clickedPoints.length===4)
  {
    var zona=ee.Geometry.Polygon(clickedPoints);
  


var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(zona)
  .filterDate('2022-06-01', '2024-09-30')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 15))
  .linkCollection(csPlus, ['cs_cdf'])
  .map(maskFull)
  .median()
  .clip(zona);
 


//---------------WATER MASKING----------------------------------//
//  Calculate AWEI (Non-Shadow version)
// var aweinsh = s2.expression(
//   '4 * (GREEN - SWIR1) - (0.25 * NIR + 2.75 * SWIR2)', {
//     'GREEN': s2.select('B3'),
//     'SWIR1': s2.select('B11'),
//     'NIR': s2.select('B8'),
//     'SWIR2': s2.select('B12')
//   }
// ).rename('AWEI_nsh');

//Calculate the mndwi so it includes the algae too
var mndwi = s2.normalizedDifference(['B3', 'B11']).rename('MNDWI');

//  Thresholding: Values > 0 indicate water ( a bit lower to take the green water too)
var waterMask = mndwi.gt(-0.2).selfMask();

var poligoane = waterMask.reduceToVectors({
  geometry: zona,
  scale: 10,
  geometryType: 'polygon',
  eightConnected: true
}).map(function(f) { return f.set('arie', f.geometry().area(1)); });

var contur = ee.Feature(poligoane.sort('arie', false).first());
var conturMask = ee.Image(1).clip(contur.geometry()).updateMask(waterMask);

//---------------NDTI/NDCI CALCULATION --------------------//

var ndci = s2.normalizedDifference(['B5', 'B4']).rename('NDCI').updateMask(conturMask);
var ndti = s2.normalizedDifference(['B4', 'B3']).rename('NDTI').updateMask(conturMask);

ndci.addBands(ndti).reduceRegion({
      reducer: ee.Reducer.minMax(),
      geometry: zona,
      scale: 10,
      maxPixels: 1e9
    }).evaluate(function(statistici) {
      print('Interval NDCI folosit:', statistici.NDCI_min, ':', statistici.NDCI_max);
      print('Interval NDTI folosit:', statistici.NDTI_min, ':', statistici.NDTI_max);
    });
    
var ndtiVis={
  min:-0.2,
  max:0.2,
  palette: [
    '0000ff', // Blue: Clear / Low turbidity
    '00ffff', // Cyan: Moderate
    '00ff00', // Green: Light turbidity / Algae
    'ffff00', // Yellow: Moderate turbidity
    'ff8000', // Orange: High turbidity
    '7f0000'  // Dark Brown: Very high suspended sediment
  ]
};
var ndciVis = {
  min: -0.1, // Low chlorophyll / oligotrophic
  max: 0.3,  // High chlorophyll / algal bloom / eutrophic
  palette: [
    '0000ff', // Blue: Very low chlorophyll (clear)
    '00ffff', // Cyan: Low
    '00ff00', // Green: Moderate
    'ffff00', // Yellow: Elevated (mesotrophic)
    'ff0000', // Red: High chlorophyll (eutrophic)
    '800080'  // Purple: Algal bloom (hypereutrophic)
    
  ]
};

var l1= ui.Map.Layer(contur, {color: 'blue'}, 'Extracted Lakes');
var l2= ui.Map.Layer(ndti,ndtiVis,'Turbidity',false);
var l3= ui.Map.Layer(ndci,ndciVis,'Chlorophyll',false);
lakeLayer.push(l1,l2,l3);
Map.layers().add(l1);
Map.layers().add(l2);
Map.layers().add(l3);
// Map.addLayer(contur, {color: 'blue'}, 'Extracted Lakes');
// Map.addLayer(ndti,ndtiVis,'Turbidity',false);
// Map.addLayer(ndci,ndciVis,'Chlorophyll',false);

}});