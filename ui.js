var service= require('users/elenasimabb/Danube_Delta_OBS:SERVICE');

var clickedPoints=[];
var layerPoints=[];
var lakeLayer=[];
var now=ee.Date(Date.now());
var defaultEndDate=now.format('YYYY-MM-dd').getInfo();
var defaultStartDate=service.aWeekAgo(defaultEndDate);
var ok=0;
var endDateBox;
var startDateBox;


/**
 * Adds the undo button
 * The undo button erase the last set point and all the configurations done until that moment
 */
function UNDOButton(){

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
  ok=0;
}});
return undoButton;
}
/**
 * Adds the Reset button
 * The reset button erase all the points and configurations done until that moment
 */
function RESETButton(){
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
    ok=0;
  
}});

  return resetButton;
}
/**
 * Sets a new point on the map 
 */
function setPoint(coords)
{
  if(clickedPoints.length<4){
  var point=ee.Geometry.Point([coords.lon,coords.lat]);
  clickedPoints.push(point);
  var pointLayer=ui.Map.Layer(point,{color: 'red'},'Point'+ clickedPoints.length);
  layerPoints.push(pointLayer);
  Map.layers().add(pointLayer);
  }
  if(clickedPoints.length===4 && ok===0){
    ok=1;
    processRegion();
    
  }
}


/**
 */
function DatePanel()
{
   startDateBox = ui.Textbox({
    placeholder: "YYYY-MM-DD",
    value: defaultStartDate,
    style:{
      width: "40%"
    }
    
  });
  
    endDateBox = ui.Textbox({
    placeholder: "YYYY-MM-DD",
    value: defaultEndDate,
    style:{
      width: "40%"
    }
  });
 
  
    var timerangePanel = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal')
  });
  timerangePanel.add(startDateBox);
  timerangePanel.add(ui.Label("-"));
  timerangePanel.add(endDateBox);
 
  return timerangePanel;
  
}

/**
 * Configures the UI Panel
 */
 
function setupPanel(){
  var panel = ui.Panel({
    style: {
      width: '30%',
      padding: '10px',
      position: 'middle-left'
    }
  });
  
  var timerangePanel= DatePanel();
  var undoButton=UNDOButton();
  var resetButton=RESETButton();

  
   panel.add(ui.Label({
    value:
      'Lake configuration',
    style:
      {
        fontWeight: 'bold',
        fontSize: '20px'
      }
  }));

var submitButton = ui.Button({
    label: 'Submit',
    onClick: function() {
      if (clickedPoints.length === 4) {
        if (lakeLayer.length > 0) {

      lakeLayer.forEach(function(layer) { Map.layers().remove(layer); });
      lakeLayer = [];
      }
        processRegion();
      }}});
  
  panel.add(ui.Label('Date: '));
  panel.add(timerangePanel);
  panel.add(submitButton);
  panel.add(undoButton);
  panel.add(resetButton);
  
  
  Map.add(panel);



}


/**
 * Displays The Indicies on the map
 */
 function processRegion()
 {
     var zona=ee.Geometry.Polygon(clickedPoints);
     var startDate= startDateBox.getValue();
     var endDate= endDateBox.getValue();
     var ndti=service.NDTI(zona,startDate,endDate);
     var ndci=service.NDCI(zona,startDate,endDate);
     
     var ndtiVis=service.NDTIvis();
     var ndciVis=service.NDCIvis();
     
     ndci.addBands(ndti).reduceRegion({
      reducer: ee.Reducer.minMax(),
      geometry: zona,
      scale: 10,
      maxPixels: 1e9
    }).evaluate(function(statistici) {
      print('Interval NDCI folosit:', statistici.NDCI_min, ':', statistici.NDCI_max);
      print('Interval NDTI folosit:', statistici.NDTI_min, ':', statistici.NDTI_max);
    });

     
     
     var contur = service.setUpLake(zona,startDate,endDate);
     var l1= ui.Map.Layer(contur, {min: 1, max: 1, palette: ['blue']}, 'Extracted Lakes');
     var l2= ui.Map.Layer(ndti,ndtiVis,'Turbidity',false);
     var l3= ui.Map.Layer(ndci,ndciVis,'Chlorophyll',false);
     
     lakeLayer.push(l1,l2,l3);
     
     Map.layers().add(l1);
     Map.layers().add(l2);
     Map.layers().add(l3);

 }
/**
 * Run all the functions
 */
 exports.startt=function()
 {

   setupPanel();
   Map.style().set('cursor','crosshair');
   Map.onClick(setPoint);
   
 };