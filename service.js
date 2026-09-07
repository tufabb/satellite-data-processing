


/**
 *Masks any type of clouds for an accurate result 
 *@param {ee.Image} image - A S2 surface image
 *@returns {ee.Image} a modified image with masked clouds
*/
function maskClouds(image) {
  var scl = image.select('SCL');
  // 3=CLOUD SHADOWS;  8=MEDIUM PROB CLOUDS;  9=HIGH PROB CLOUDS; 10=CIRRUS CLOUDS; 11=ICE/SNOW
  var sclMask = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
  var csMask = image.select('cs_cdf').gte(0.4);
  return image.updateMask(sclMask.and(csMask));
}


/**
 *Builds a specific area of satetellite images
 *@param {ee.Geometry} zona - a shape with 4 point on the map
 *@returns {ee.Image} a ready to use collection of images
*/
function setUpSentinel(zona,startDate,endDate)
{
  var csPlus = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(zona)
  .filterDate(startDate, endDate)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 15))
  .linkCollection(csPlus, ['cs_cdf'])
  .map(maskClouds)
  .sort('system:time_start', false)
  .median()
  .clip(zona);
  return s2;
}


/**
 * Finds the biggest lake in the passed area and returns it 
 *@param {ee.Geometry} zona - a shape with 4 point on the map
 *@returns {ee.Image} the countur of the biggest body of water
 *@throws {Error} if there is no body of water in the area
*/
function setUpLake(zona,startDate,endDate)
{
var s2=setUpSentinel(zona,startDate,endDate);
  
  //Calculate the mndwi so it includes the algae too
var mndwi = s2.normalizedDifference(['B3', 'B11']).rename('MNDWI');

//  Thresholding: Values > 0 indicate water ( a bit lower to take the green water too)

  var waterMask = mndwi.gt(-0.2).selfMask();

var poligoane = waterMask.reduceToVectors({
  reducer: ee.Reducer.countEvery(),
  geometry: zona,
  scale: 10,
  geometryType: 'polygon',
  eightConnected: true,
  maxPixels: 1e8
}).map(function(f) { return f.set('arie', f.geometry().area(1)); });

var contur = ee.Feature(poligoane.sort('arie', false).first());
var conturMask = ee.Image(1).clip(contur.geometry()).updateMask(waterMask);
return conturMask;
}

/**
 * Calculates the NDTI level
 * @return {} the turbidity level of the water
 * 
*/
function NDTI(zona,startDate,endDate)
{
    var s2=setUpSentinel(zona,startDate,endDate);
    var conturMask=setUpLake(zona,startDate,endDate);
    var ndti = s2.normalizedDifference(['B4', 'B3']).rename('NDTI').updateMask(conturMask);
    return ndti;
  
}

/**
 * Calculates the NDCI level
 * @returns {} the chlorophyll level of the water
 * 
*/
function NDCI(zona,startDate,endDate)
{
    var s2=setUpSentinel(zona,startDate,endDate);
    var conturMask=setUpLake(zona,startDate,endDate);
    var ndci = s2.normalizedDifference(['B5', 'B4']).rename('NDCI').updateMask(conturMask);
    return ndci;
}

/**
 * @returns {Object} visualisation pallete of the NDTI
 */
function NDTIvis()
{
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
return ndtiVis;
}

/**
 * @returns {Object} visualisation pallete of the NDCI
 */
function NDCIvis()
{
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

return ndciVis;
}

/**
 */
 function aWeekAgo(startDate)
 {
   var endDate= ee.Date(startDate).advance(-1, 'week').format('YYYY-MM-dd').getInfo();
   return endDate;
 }
exports.aWeekAgo=aWeekAgo;
exports.setUpLake = setUpLake;
exports.NDTI = NDTI;
exports.NDCI = NDCI;
exports.NDTIvis = NDTIvis;
exports.NDCIvis = NDCIvis;